"""
Transfer-learning trainer (PyTorch + torchvision). Runs only inside the worker process.

    manifest + split → DataLoaders → ImageNet-pretrained backbone with a new head
    → epochs (train → validate) → best checkpoint by validation loss (+ early stopping)
    → reload best → evaluate once on the held-out test set → artefact bundle → model registry

Every number written to the database is measured here; nothing is estimated except the clearly
labelled ETA in the live progress block.
"""
from __future__ import annotations

import logging
import platform
import random
import sys
import time
from pathlib import Path

import numpy as np

from .. import audit, storage
from ..config import get_settings
from ..datasets import service as datasets
from ..db import connect, dumps, loads, now, transaction
from ..errors import redact_paths
from ..naming import crop_label, looks_healthy
from ..training import Cancelled, JobReporter, ensure_job_exists
from . import artifact, metrics
from .architectures import ARCHITECTURES, build_model, set_backbone_trainable
from .data import ManifestDataset, seed_worker
from .preprocessing import eval_transform, make_augmentation, make_preprocessing, train_transform

log = logging.getLogger("kd.trainer")


class TrainError(Exception):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


def _seed_all(seed: int) -> None:
    import torch

    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    torch.cuda.manual_seed_all(seed)
    torch.backends.cudnn.benchmark = False


def resolve_device(requested: str):
    import torch

    want = requested if requested != "auto" else get_settings().training_device
    if want == "cuda" or (want == "auto" and torch.cuda.is_available()):
        if not torch.cuda.is_available():
            raise TrainError("gpu_unavailable", "GPU training was requested, but no CUDA GPU is available to the training worker. Choose “auto” or “cpu”, or run the worker on a GPU machine.")
        return torch.device("cuda")
    return torch.device("cpu")


def _evaluate(model, loader, device, amp: bool, reporter: JobReporter | None = None, phase: str = "val"):
    import torch
    import torch.nn.functional as F

    model.eval()
    total_loss, n = 0.0, 0
    probs_all, y_all = [], []
    with torch.no_grad():
        for b, (x, y) in enumerate(loader):
            if reporter:
                reporter.check_cancel()
                reporter.live(live={"phase": phase, "batch": b + 1, "batches": len(loader)})
            x, y = x.to(device, non_blocking=True), y.to(device, non_blocking=True)
            with torch.autocast(device_type=device.type, dtype=torch.float16, enabled=amp):
                logits = model(x)
            logits = logits.float()
            total_loss += F.cross_entropy(logits, y, reduction="sum").item()
            n += y.numel()
            probs_all.append(torch.softmax(logits, dim=1).cpu().numpy())
            y_all.append(y.cpu().numpy())
    probs = np.concatenate(probs_all) if probs_all else np.zeros((0, 0))
    ys = np.concatenate(y_all) if y_all else np.zeros((0,), dtype=np.int64)
    return (total_loss / n if n else float("nan")), probs, ys


def run_job(job_id: str) -> None:
    import torch

    rep = JobReporter(job_id)
    job = ensure_job_exists(job_id)
    cfg = loads(job["config_json"], {})
    with connect() as c:
        model_row = dict(c.execute("SELECT * FROM models WHERE training_job_id = ?", (job_id,)).fetchone())
        dsv = dict(c.execute("SELECT v.*, d.name AS dataset_name FROM dataset_versions v JOIN datasets d ON d.id = v.dataset_id WHERE v.id = ?", (job["dataset_version_id"],)).fetchone())
    model_id = model_row["id"]
    ckpt_dir = storage.checkpoint_dir(job_id)
    t_start = time.monotonic()
    epochs_done = 0

    try:
        rep.status("preparing", "Loading dataset manifest and split")
        manifest = datasets.load_manifest(job["dataset_version_id"])
        split_row, assign = datasets.load_split_assignments(job["split_id"])
        entries = manifest["entries"]
        if len(assign) != len(entries):
            raise TrainError("split_mismatch", "The split does not match the dataset manifest.")
        classes = loads(model_row["classes_json"], [])
        index = {c["id"]: c["index"] for c in classes}
        parts: dict[str, list[tuple[str, int]]] = {"train": [], "val": [], "test": []}
        for e, s in zip(entries, assign):
            if s in parts and e["class"] in index:
                parts[s].append((e["path"], index[e["class"]]))
        if not all(parts.values()):
            raise TrainError("empty_partition", "One of the train/validation/test partitions is empty.")

        _seed_all(cfg["seed"])
        device = resolve_device(cfg["device"])
        amp = bool(cfg["mixed_precision"]) and device.type == "cuda"
        device_name = torch.cuda.get_device_name(device) if device.type == "cuda" else (platform.processor() or "CPU")
        rep.status("preparing", "Preparing data loaders", device=device.type, device_name=device_name[:120])

        pre = make_preprocessing(cfg["image_size"])
        aug = make_augmentation(cfg["augmentation"])
        root = manifest["root"]
        nw = cfg["num_workers"] if cfg.get("num_workers") is not None else get_settings().training_num_workers
        common = {"num_workers": nw, "pin_memory": device.type == "cuda", "persistent_workers": nw > 0, "worker_init_fn": seed_worker}
        g = torch.Generator()
        g.manual_seed(cfg["seed"])
        train_ds = ManifestDataset(root, parts["train"], train_transform(pre, aug))
        train_loader = torch.utils.data.DataLoader(train_ds, batch_size=cfg["batch_size"], shuffle=True, generator=g, drop_last=len(train_ds) > cfg["batch_size"], **common)
        val_loader = torch.utils.data.DataLoader(ManifestDataset(root, parts["val"], eval_transform(pre)), batch_size=cfg["batch_size"], shuffle=False, **common)
        test_loader = torch.utils.data.DataLoader(ManifestDataset(root, parts["test"], eval_transform(pre)), batch_size=cfg["batch_size"], shuffle=False, **common)

        rep.status("preparing", "Downloading/loading ImageNet pretrained weights" if cfg["pretrained"] else "Building the network")
        torch.hub.set_dir(str(get_settings().weights_dir))
        try:
            model = build_model(cfg["architecture"], len(classes), cfg["pretrained"])
        except Exception as e:  # network errors, corrupt cache
            if cfg["pretrained"]:
                raise TrainError("pretrained_weights_unavailable", f"Could not load the ImageNet pretrained weights ({type(e).__name__}). The worker needs internet access once to download them from download.pytorch.org, or turn off “Pretrained weights”.")
            raise
        model.to(device)

        weight = None
        if cfg["class_weighting"]:
            counts = np.bincount([y for _, y in parts["train"]], minlength=len(classes)).astype(float)
            w = counts.sum() / (len(classes) * np.maximum(counts, 1))
            weight = torch.tensor(w, dtype=torch.float32, device=device)
        criterion = torch.nn.CrossEntropyLoss(weight=weight, label_smoothing=cfg["label_smoothing"])
        optimizer = torch.optim.AdamW(model.parameters(), lr=cfg["learning_rate"], weight_decay=cfg["weight_decay"])
        if cfg["lr_schedule"] == "cosine":
            scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=cfg["epochs"])
        elif cfg["lr_schedule"] == "plateau":
            scheduler = torch.optim.lr_scheduler.ReduceLROnPlateau(optimizer, mode="min", factor=0.5, patience=2)
        else:
            scheduler = None
        scaler = torch.amp.GradScaler("cuda", enabled=amp)

        ckpt_dir.mkdir(parents=True, exist_ok=True)
        best_path = ckpt_dir / "best.pt"
        best_loss, best_epoch, bad_epochs, early_stopped = float("inf"), None, 0, False
        E = cfg["epochs"]
        nb = len(train_loader)

        for epoch in range(1, E + 1):
            rep.check_cancel(force=True)
            if cfg["freeze_backbone_epochs"]:
                set_backbone_trainable(model, cfg["architecture"], epoch > cfg["freeze_backbone_epochs"])
            rep.status("training", f"Epoch {epoch} of {E}: training", current_epoch=epoch, batches_per_epoch=nb)
            model.train()
            t_ep = time.monotonic()
            run_loss, run_correct, seen = 0.0, 0, 0
            for b, (x, y) in enumerate(train_loader):
                rep.check_cancel()
                x, y = x.to(device, non_blocking=True), y.to(device, non_blocking=True)
                optimizer.zero_grad(set_to_none=True)
                with torch.autocast(device_type=device.type, dtype=torch.float16, enabled=amp):
                    logits = model(x)
                    loss = criterion(logits, y)
                if not torch.isfinite(loss):
                    raise TrainError("loss_diverged", f"Training loss became {loss.item()} in epoch {epoch}. Try a lower learning rate.")
                scaler.scale(loss).backward()
                scaler.step(optimizer)
                scaler.update()
                bs = y.numel()
                run_loss += loss.item() * bs
                run_correct += (logits.argmax(1) == y).sum().item()
                seen += bs
                elapsed = time.monotonic() - t_ep
                rate = seen / elapsed if elapsed > 0 else None
                done_frac = (epoch - 1 + (b + 1) / nb) / E
                rep.live(
                    batch_index=b + 1,
                    overall_progress=round(0.95 * done_frac, 4),
                    live={"phase": "train", "batch": b + 1, "batches": nb, "running_loss": run_loss / seen, "running_accuracy": run_correct / seen,
                          "learning_rate": optimizer.param_groups[0]["lr"], "images_per_second": rate},
                )
            train_loss, train_acc = run_loss / max(seen, 1), run_correct / max(seen, 1)
            lr_used = optimizer.param_groups[0]["lr"]

            rep.status("validating", f"Epoch {epoch} of {E}: validating")
            val_loss, vprobs, vy = _evaluate(model, val_loader, device, amp, rep, "val")
            vpred = vprobs.argmax(1) if len(vy) else np.zeros(0, dtype=np.int64)
            val_acc = float((vpred == vy).mean()) if len(vy) else None
            val_f1 = metrics.macro_f1(vy, vpred, len(classes)) if len(vy) else None

            if scheduler is not None:
                scheduler.step(val_loss) if cfg["lr_schedule"] == "plateau" else scheduler.step()

            improved = val_loss < best_loss - 1e-6
            if improved:
                best_loss, best_epoch, bad_epochs = val_loss, epoch, 0
                torch.save({k: v.detach().cpu() for k, v in model.state_dict().items()}, best_path)
            else:
                bad_epochs += 1
            epochs_done = epoch
            rep.epoch({"epoch": epoch, "train_loss": train_loss, "train_accuracy": train_acc, "val_loss": val_loss, "val_accuracy": val_acc,
                       "val_macro_f1": val_f1, "learning_rate": lr_used, "duration_s": round(time.monotonic() - t_ep, 2), "is_best": improved})
            rep.live(force=True, best_epoch=best_epoch, overall_progress=round(0.95 * epoch / E, 4))
            if cfg["early_stopping"] and bad_epochs >= cfg["early_stopping_patience"]:
                early_stopped = True
                break

        rep.live(force=True, early_stopped=1 if early_stopped else 0)
        train_duration = time.monotonic() - t_start

        # ---- Evaluation of the best checkpoint on the untouched test set
        rep.status("evaluating", f"Evaluating the best checkpoint (epoch {best_epoch}) on {len(parts['test']):,} test images")
        try:
            model.load_state_dict(torch.load(best_path, map_location=device, weights_only=True))
            test_loss, probs, ys = _evaluate(model, test_loader, device, amp, rep, "test")
            preds = probs.argmax(1)
            cm = metrics.confusion_matrix(ys, preds, len(classes))
            ids = [c["id"] for c in classes]
            disp = [c["display_name"] for c in classes]
            rep_ = metrics.report(cm, ids, disp)
            evaluation = {
                "evaluated_at": now(),
                "checkpoint_epoch": best_epoch,
                "selection": "lowest validation loss",
                "test_loss": round(test_loss, 6),
                "top3_accuracy": metrics.top_k_accuracy(probs, ys, 3),
                "confusion_matrix": {"labels": ids, "display_labels": disp, "matrix": cm.tolist(), "rows": "true class", "columns": "predicted class"},
                **rep_,
                "definitions": {
                    "accuracy": "Correct predictions ÷ all test images.",
                    "macro": "Unweighted mean over classes that have test images — every class counts equally.",
                    "weighted": "Mean weighted by each class's number of test images.",
                },
            }
            ev_dir = storage.evaluation_dir(model_id)
            ev_dir.mkdir(parents=True, exist_ok=True)
            test_items = parts["test"]
            (ev_dir / "test_predictions.json").write_text(dumps([
                {"file": p, "true": ids[t], "predicted": ids[int(pr.argmax())], "confidence": round(float(pr.max()), 6)}
                for (p, t), pr in zip(test_items, probs)
            ]), encoding="utf-8")

            mdir = storage.model_dir(model_id)
            sha, size = artifact.save_weights(mdir, cfg["architecture"], len(classes), model.state_dict())
            class_meta = [{**c, "crop": crop_label(c["id"]), "is_healthy": looks_healthy(c["id"])} for c in classes]
            import PIL
            import torchvision

            manifest_out = {
                "format": "kd-disease-model-manifest", "format_version": 1,
                "model_id": model_id, "name": model_row["name"], "model_version": model_row["version"], "created_at": now(), "created_by": model_row["created_by"],
                "framework": "pytorch", "framework_version": torch.__version__, "torchvision_version": torchvision.__version__,
                "architecture": cfg["architecture"], "architecture_label": ARCHITECTURES[cfg["architecture"]].label,
                "pretrained_weights": ARCHITECTURES[cfg["architecture"]].weights if cfg["pretrained"] else None,
                "classes": class_meta, "class_mapping": {c["id"]: c["index"] for c in classes},
                "input_shape": pre["input_shape"], "preprocessing": pre, "augmentation": aug, "training_config": cfg,
                "dataset": {
                    "dataset_id": dsv["dataset_id"], "dataset_name": dsv["dataset_name"], "dataset_version_id": dsv["id"], "dataset_version": dsv["version"],
                    "content_hash": dsv["content_hash"], "permission_status_at_training": dsv["permission_status"],
                    "split_id": split_row["id"], "split_strategy": split_row["strategy"], "split_seed": split_row["seed"], "split_manifest_sha256": split_row["manifest_sha256"],
                    "counts": {k: len(v) for k, v in parts.items()},
                },
                "training_job": {"id": job_id, "number": job["number"], "device": device.type, "device_name": device_name, "epochs_completed": epochs_done,
                                 "best_epoch": best_epoch, "early_stopped": early_stopped, "duration_s": round(train_duration, 1)},
                "metrics": {"test_accuracy": rep_["accuracy"], "macro": rep_["macro"], "weighted": rep_["weighted"], "top3_accuracy": evaluation["top3_accuracy"], "test_images": rep_["test_images"]},
                "uncertainty": {"method": "softmax confidence threshold (configured at deployment)", "ood_detection": False},
                "weights_file": artifact.WEIGHTS, "weights_sha256": sha,
                "library_versions": {"python": sys.version.split()[0], "numpy": np.__version__, "pillow": PIL.__version__},
                "reproducibility_note": "Same data, split, seed and config give approximately the same model. Bit-exact results are not guaranteed across GPUs, drivers or library versions.",
            }
            artifact.write_json(mdir, artifact.MANIFEST, manifest_out)
            artifact.write_json(mdir, artifact.METRICS, evaluation)
        except Cancelled:
            raise
        except Exception as e:
            log.exception("Evaluation failed for job %s", job_id)
            _finish(job_id, model_id, "failed", "evaluation_failed", f"Training finished but evaluation failed ({type(e).__name__}: {redact_paths(e, 200)}).",
                    model_status="evaluation_failed", epochs_done=epochs_done, duration=time.monotonic() - t_start)
            return

        t = now()
        with connect() as c, transaction(c):
            c.execute(
                """UPDATE models SET status = 'ready', status_detail = NULL, framework_version = ?, preprocessing_json = ?, augmentation_json = ?,
                       epochs_completed = ?, test_accuracy = ?, precision_macro = ?, recall_macro = ?, f1_macro = ?, precision_weighted = ?,
                       recall_weighted = ?, f1_weighted = ?, evaluation_json = ?, model_path = ?, model_sha256 = ?, model_bytes = ?,
                       training_duration_s = ?, trained_at = ?, classes_json = ? WHERE id = ?""",
                (torch.__version__, dumps(pre), dumps(aug), epochs_done, rep_["accuracy"], rep_["macro"]["precision"], rep_["macro"]["recall"], rep_["macro"]["f1"],
                 rep_["weighted"]["precision"], rep_["weighted"]["recall"], rep_["weighted"]["f1"], dumps(evaluation), storage.rel(mdir), sha, size,
                 round(train_duration, 1), t, dumps(class_meta), model_id),
            )
            c.execute(
                "UPDATE training_jobs SET status = 'completed', status_detail = NULL, overall_progress = 1, finished_at = ?, updated_at = ?, best_epoch = ?, current_epoch = ? WHERE id = ?",
                (t, t, best_epoch, epochs_done, job_id),
            )
            audit.record("system", "training.completed", "training_job", job_id, conn=c, model_id=model_id, test_accuracy=rep_["accuracy"], f1_macro=rep_["macro"]["f1"])
    except Cancelled:
        _finish(job_id, model_id, "cancelled", None, None, model_status="cancelled", epochs_done=epochs_done, duration=time.monotonic() - t_start)
    except TrainError as e:
        _finish(job_id, model_id, "failed", e.code, e.message, model_status="failed", epochs_done=epochs_done, duration=time.monotonic() - t_start)
    except Exception as e:
        oom = type(e).__name__ == "OutOfMemoryError" or "out of memory" in str(e).lower()
        if oom:
            msg = "The GPU ran out of memory. Reduce the batch size or image size, or use a smaller architecture."
            code = "out_of_memory"
        else:
            log.exception("Training job %s crashed", job_id)
            msg = f"Training crashed: {type(e).__name__}: {redact_paths(e, 300)}"
            code = "training_crashed"
        _finish(job_id, model_id, "failed", code, msg, model_status="failed", epochs_done=epochs_done, duration=time.monotonic() - t_start)
    finally:
        storage.remove_tree(ckpt_dir)
        try:
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
        except Exception:
            pass


def _finish(job_id: str, model_id: str, status: str, code: str | None, message: str | None, *, model_status: str, epochs_done: int, duration: float) -> None:
    t = now()
    with connect() as c, transaction(c):
        c.execute(
            "UPDATE training_jobs SET status = ?, error_code = ?, error_message = ?, status_detail = NULL, finished_at = ?, updated_at = ?, current_epoch = ? WHERE id = ?",
            (status, code, message, t, t, epochs_done, job_id),
        )
        c.execute("UPDATE models SET status = ?, status_detail = ?, epochs_completed = ?, training_duration_s = ? WHERE id = ?",
                  (model_status, message or ("Training was cancelled." if status == "cancelled" else None), epochs_done, round(duration, 1), model_id))
        audit.record("system", f"training.{status}", "training_job", job_id, conn=c, error_code=code)
    if status != "completed":
        storage.remove_tree(storage.model_dir(model_id))
