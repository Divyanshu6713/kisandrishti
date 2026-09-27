"""
Inference service: resolves the active production model, keeps it in memory, and runs predictions
with the model's own saved preprocessing (ml/preprocessing.py).

* The active model is looked up from `model_deployments` on each request (one indexed SQLite query);
  the loaded network is cached per model id, so a deployment or rollback is picked up by every API
  process on its next request without restarting.
* Weights are checked against their recorded SHA-256 before loading and loaded with
  torch.load(weights_only=True).
* Uncertainty handling is a softmax-confidence threshold. It is NOT out-of-distribution detection:
  an image of a disease the model was never trained on can still get a high score.
"""
from __future__ import annotations

import io
import logging
import threading
import time
import warnings
from collections import OrderedDict
from dataclasses import dataclass

from PIL import Image, ImageOps, UnidentifiedImageError

from . import storage
from .config import get_settings
from .db import connect, new_id, now
from .errors import AppError

log = logging.getLogger("kd.inference")

ALLOWED = {"JPEG", "MPO", "PNG", "WEBP"}
UNCERTAINTY_NOTE = (
    "Confidence-based uncertainty only: predictions below the threshold are reported as uncertain. "
    "The model can only choose among the conditions it was trained on and cannot reliably recognise unknown diseases."
)


@dataclass
class LoadedModel:
    model_id: str
    version: str
    name: str
    manifest: dict
    net: object
    transform: object
    device: str
    lock: threading.Lock


_cache: "OrderedDict[str, LoadedModel]" = OrderedDict()
_cache_lock = threading.Lock()
_CACHE_SIZE = 2  # the active model + one being tested/deployed


def _load(model_id: str) -> LoadedModel:
    with _cache_lock:
        if model_id in _cache:
            _cache.move_to_end(model_id)
            return _cache[model_id]
    with connect() as c:
        r = c.execute("SELECT id, version, name, status, model_path, model_sha256 FROM models WHERE id = ?", (model_id,)).fetchone()
    if not r:
        raise AppError(404, "not_found", "Model was not found.")
    if r["status"] not in ("ready", "deployed") or not r["model_path"]:
        raise AppError(409, "model_not_ready", "This model has no evaluated artefact that can be loaded.")
    from .ml.artifact import ArtifactError, load_model
    from .ml.preprocessing import eval_transform

    device = get_settings().inference_device
    try:
        net, manifest = load_model(storage.resolve(r["model_path"]), r["model_sha256"], device)
        transform = eval_transform(manifest["preprocessing"])
    except ArtifactError as e:
        log.error("Model %s failed to load: %s", model_id, e.code)
        raise AppError(503, "model_load_failed", f"The model could not be loaded: {e.message}")
    except Exception:
        log.exception("Model %s failed to load", model_id)
        raise AppError(503, "model_load_failed", "The model could not be loaded.")
    lm = LoadedModel(model_id, r["version"], r["name"], manifest, net, transform, device, threading.Lock())
    with _cache_lock:
        _cache[model_id] = lm
        _cache.move_to_end(model_id)
        while len(_cache) > _CACHE_SIZE:
            _cache.popitem(last=False)
    return lm


def evict(model_id: str) -> None:
    with _cache_lock:
        _cache.pop(model_id, None)


def verify_loadable(model_id: str) -> LoadedModel:
    """Used before a deployment switches over: the new model must load, or nothing changes."""
    evict(model_id)
    return _load(model_id)


def active_deployment(environment: str = "production") -> dict | None:
    with connect() as c:
        r = c.execute(
            """SELECT dp.id AS deployment_id, dp.number, dp.deployed_at, m.id AS model_id, m.version, m.name, v.version AS dataset_version, d.name AS dataset_name
               FROM model_deployments dp JOIN models m ON m.id = dp.model_id
               JOIN dataset_versions v ON v.id = m.dataset_version_id JOIN datasets d ON d.id = v.dataset_id
               WHERE dp.environment = ? AND dp.status = 'active' ORDER BY dp.number DESC LIMIT 1""",
            (environment,),
        ).fetchone()
    return dict(r) if r else None


def confidence_threshold() -> float:
    with connect() as c:
        r = c.execute("SELECT value FROM settings WHERE key = 'confidence_threshold'").fetchone()
    try:
        return float(r["value"]) if r else get_settings().default_confidence_threshold
    except ValueError:
        return get_settings().default_confidence_threshold


def decode_image(data: bytes) -> Image.Image:
    s = get_settings()
    if not data:
        raise AppError(400, "invalid_image", "No image was received.")
    if len(data) > s.max_predict_bytes:
        raise AppError(413, "too_large", f"The photo is larger than {s.max_predict_bytes // (1024 * 1024)} MB.")
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            im = Image.open(io.BytesIO(data))
            if im.format not in ALLOWED:
                raise AppError(415, "unsupported_type", "Please use a JPG, PNG or WebP photo.")
            w, h = im.size
            if w * h > s.max_image_pixels:
                raise AppError(400, "invalid_image", "The photo has too many pixels.")
            if min(w, h) < 32:
                raise AppError(400, "invalid_image", "The photo is too small. Use at least 32 × 32 pixels.")
            im.load()
            return ImageOps.exif_transpose(im).convert("RGB")
    except AppError:
        raise
    except (UnidentifiedImageError, OSError, SyntaxError, ValueError, EOFError, Image.DecompressionBombError, Image.DecompressionBombWarning):
        raise AppError(400, "invalid_image", "This file could not be read as an image. Try another photo.")


def _predict(lm: LoadedModel, img: Image.Image, threshold: float, top_k: int = 3) -> dict:
    import torch

    x = lm.transform(img).unsqueeze(0).to(lm.device)
    t0 = time.perf_counter()
    with lm.lock, torch.inference_mode():
        probs = torch.softmax(lm.net(x).float(), dim=1)[0].cpu()
    ms = (time.perf_counter() - t0) * 1000
    k = min(top_k, probs.numel())
    vals, idx = torch.topk(probs, k)
    classes = lm.manifest["classes"]

    def item(i: int, p: float) -> dict:
        c = classes[i]
        return {"class_id": c["id"], "display_name": c["display_name"], "crop": c.get("crop"), "is_healthy": bool(c.get("is_healthy")), "probability": round(float(p), 6)}

    top = [item(int(i), float(p)) for p, i in zip(vals, idx)]
    confidence = top[0]["probability"]
    uncertain = confidence < threshold
    ds = lm.manifest.get("dataset", {})
    return {
        "status": "uncertain" if uncertain else "ok",
        "uncertain": uncertain,
        "prediction": {**{k_: top[0][k_] for k_ in ("class_id", "display_name", "crop", "is_healthy")}, "confidence": confidence},
        "top_predictions": top,
        "threshold": threshold,
        "model": {
            "model_id": lm.model_id, "model_version": lm.version, "name": lm.name,
            "architecture": lm.manifest.get("architecture_label", lm.manifest.get("architecture")),
            "dataset_name": ds.get("dataset_name"), "dataset_version": ds.get("dataset_version"),
        },
        "metadata": {"inference_ms": round(ms, 1), "input_size": lm.manifest["preprocessing"]["image_size"], "image": {"width": img.width, "height": img.height}},
        "notice": UNCERTAINTY_NOTE,
    }


def _log(result: dict, source: str, deployment_id: str | None) -> str:
    pid = new_id("pred")
    try:
        with connect() as c:
            c.execute(
                """INSERT INTO prediction_logs (id, model_id, deployment_id, source, predicted_class, confidence, uncertain, threshold, inference_ms, created_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (pid, result["model"]["model_id"], deployment_id, source, result["prediction"]["class_id"], result["prediction"]["confidence"],
                 1 if result["uncertain"] else 0, result["threshold"], result["metadata"]["inference_ms"], now()),
            )
    except Exception:  # logging must never break a prediction
        log.exception("Could not write prediction log")
    return pid


def predict_active(data: bytes) -> dict:
    """Farmer-facing prediction with the deployed model. No image is written to disk or kept."""
    dep = active_deployment()
    if not dep:
        raise AppError(503, "no_model_deployed", "Disease identification is temporarily unavailable because no trained model is currently deployed.")
    img = decode_image(data)
    lm = _load(dep["model_id"])
    result = _predict(lm, img, confidence_threshold())
    result["prediction_id"] = _log(result, "farmer", dep["deployment_id"])
    return result


def predict_with(model_id: str, data: bytes) -> dict:
    """Admin test prediction with any ready model (deployed or not)."""
    img = decode_image(data)
    lm = _load(model_id)
    result = _predict(lm, img, confidence_threshold())
    result["prediction_id"] = _log(result, "admin_test", None)
    return result


def public_model_card() -> dict:
    dep = active_deployment()
    if not dep:
        return {"deployed": False, "message": "No trained disease model is currently deployed."}
    with connect() as c:
        r = c.execute("SELECT classes_json, architecture, test_accuracy, f1_macro, trained_at FROM models WHERE id = ?", (dep["model_id"],)).fetchone()
    from .db import loads

    classes = loads(r["classes_json"], [])
    return {
        "deployed": True,
        "model": {"model_id": dep["model_id"], "model_version": dep["version"], "name": dep["name"], "dataset_name": dep["dataset_name"], "dataset_version": dep["dataset_version"], "deployed_at": dep["deployed_at"], "trained_at": r["trained_at"]},
        "classes": [{"class_id": c["id"], "display_name": c["display_name"], "crop": c.get("crop"), "is_healthy": bool(c.get("is_healthy"))} for c in classes],
        "threshold": confidence_threshold(),
        "notice": UNCERTAINTY_NOTE,
    }
