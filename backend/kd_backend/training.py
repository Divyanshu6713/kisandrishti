"""
Training jobs: configuration validation, job records, cooperative cancellation and progress persistence.
The heavy lifting (PyTorch) is in ml/trainer.py and runs only in the worker process.

Job lifecycle:
    queued → preparing → training ⇄ validating → evaluating → completed
       ↘ cancelled          ↘ cancel_requested → cancelled         ↘ failed
A model record is created with the job (status "training") so the lineage
dataset version → split → training job → model exists from the start.
"""
from __future__ import annotations

import time
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from . import audit
from .datasets import service as datasets
from .db import connect, dumps, loads, new_id, next_number, now, transaction
from .errors import AppError, bad_request, conflict, not_found
from .ml.architectures import ARCHITECTURES, DEFAULT_ARCHITECTURE
from .naming import VERSION_RE, suggest_next_version

ACTIVE = ("preparing", "training", "validating", "evaluating", "cancel_requested")
TERMINAL = ("completed", "failed", "cancelled")


class TrainingConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")

    architecture: Literal["efficientnet_b0", "mobilenet_v3_large", "resnet18", "resnet50"] = DEFAULT_ARCHITECTURE  # type: ignore[assignment]
    pretrained: bool = True
    epochs: int = Field(20, ge=1, le=300)
    batch_size: int = Field(32, ge=1, le=512)
    learning_rate: float = Field(3e-4, gt=0, le=1.0)
    image_size: int = Field(224, ge=64, le=512)
    early_stopping: bool = True
    early_stopping_patience: int = Field(5, ge=1, le=100)
    augmentation: bool = True
    seed: int = Field(42, ge=0, le=2**31 - 1)
    # Advanced
    weight_decay: float = Field(1e-4, ge=0, le=1)
    lr_schedule: Literal["cosine", "plateau", "none"] = "cosine"
    label_smoothing: float = Field(0.0, ge=0, le=0.3)
    class_weighting: bool = False
    freeze_backbone_epochs: int = Field(0, ge=0, le=100)
    mixed_precision: bool = True
    device: Literal["auto", "cuda", "cpu"] = "auto"
    num_workers: int | None = Field(None, ge=0, le=16)


class CreateJob(BaseModel):
    model_config = ConfigDict(extra="forbid")

    dataset_version_id: str = Field(min_length=1, max_length=64)
    split_id: str = Field(min_length=1, max_length=64)
    model_version: str = Field(min_length=1, max_length=16)
    model_name: str = Field("Disease Model", min_length=1, max_length=80)
    config: TrainingConfig = TrainingConfig()


def options() -> dict:
    props = TrainingConfig.model_json_schema()["properties"]
    limits = {k: {"min": v.get("minimum", v.get("exclusiveMinimum")), "max": v["maximum"]} for k, v in props.items() if "maximum" in v}
    return {"architectures": [a.__dict__ for a in ARCHITECTURES.values()], "defaults": TrainingConfig().model_dump(), "limits": limits}


def suggest_version(dataset_version_id: str | None, architecture: str) -> dict:
    with connect() as c:
        rows = c.execute("SELECT version, classes_json, architecture FROM models").fetchall()
        classes = []
        if dataset_version_id:
            classes = [r["raw_name"] for r in c.execute("SELECT raw_name FROM dataset_classes WHERE dataset_version_id = ? ORDER BY class_index", (dataset_version_id,))]
    existing = [(r["version"], [x["id"] for x in loads(r["classes_json"], [])], r["architecture"]) for r in rows]
    v, why = suggest_next_version(existing, classes, architecture)
    taken = {r["version"] for r in rows}
    while v in taken:  # never suggest a used version
        major, minor = v.split(".")[:2]
        v = f"{major}.{int(minor) + 1}"
    return {"version": v, "reason": why}


def create_job(req: CreateJob, actor: str) -> dict:
    if not VERSION_RE.match(req.model_version):
        raise bad_request("invalid_model_version", "Model version must look like 1.0 or 1.2.3.")
    dsv = datasets.get_version(req.dataset_version_id)
    if dsv["status"] not in datasets.USABLE:
        raise conflict("dataset_not_ready", "This dataset version has not passed validation.")
    split = next((s for s in dsv["splits"] if s["id"] == req.split_id), None)
    if not split:
        raise bad_request("invalid_split", "The selected split does not belong to this dataset version.")
    for part, n in (("training", split["train_count"]), ("validation", split["val_count"]), ("test", split["test_count"])):
        if n <= 0:
            raise bad_request("empty_partition", f"The selected split has no {part} images.")
    classes = [c["raw_name"] for c in dsv["classes"]]
    no_train = [c for c in classes if (split["per_class"].get(c) or {}).get("train", 0) == 0]
    if no_train:
        raise bad_request("class_without_training_images", f"{len(no_train)} class(es) have no training images in this split (e.g. {no_train[0]}). Generate a different split.")
    # device == "cuda" is checked by the worker, which knows its own hardware.
    cfg = req.config.model_dump()
    t = now()
    with connect() as c, transaction(c):
        if c.execute("SELECT 1 FROM models WHERE version = ?", (req.model_version,)).fetchone():
            raise conflict("model_version_exists", f"Model version {req.model_version} already exists. Choose another version.")
        job_id = new_id("job")
        number = next_number(c, "training_jobs")
        c.execute(
            """INSERT INTO training_jobs (id, number, dataset_version_id, split_id, config_json, status, total_epochs, created_by, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, 'queued', ?, ?, ?, ?)""",
            (job_id, number, dsv["id"], split["id"], dumps({**cfg, "model_version": req.model_version, "model_name": req.model_name}), cfg["epochs"], actor, t, t),
        )
        model_id = new_id("mdl")
        class_list = [{"index": i, "id": cl["raw_name"], "display_name": cl["display_name"]} for i, cl in enumerate(dsv["classes"])]
        c.execute(
            """INSERT INTO models (id, name, version, training_job_id, dataset_version_id, split_id, architecture, framework, status, class_count,
                   classes_json, config_json, training_images, validation_images, test_images, epochs_configured, batch_size, learning_rate,
                   image_size, random_seed, created_by, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, 'pytorch', 'training', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (model_id, req.model_name, req.model_version, job_id, dsv["id"], split["id"], cfg["architecture"], len(class_list), dumps(class_list), dumps(cfg),
             split["train_count"], split["val_count"], split["test_count"], cfg["epochs"], cfg["batch_size"], cfg["learning_rate"], cfg["image_size"], cfg["seed"], actor, t),
        )
        c.execute("UPDATE dataset_versions SET locked_at = COALESCE(locked_at, ?) WHERE id = ?", (t, dsv["id"]))
        audit.record(actor, "training.started", "training_job", job_id, conn=c, number=number, model_id=model_id, model_version=req.model_version,
                     dataset_version_id=dsv["id"], split_id=split["id"], config=cfg)
    return get_job(job_id)


def _job_public(r: dict) -> dict:
    d = dict(r)
    d["config"] = loads(d.pop("config_json"), {})
    d["live"] = loads(d.pop("live_json", None))
    return d


def list_jobs(limit: int = 50) -> list[dict]:
    with connect() as c:
        rows = c.execute(
            """SELECT j.*, m.id AS model_id, m.version AS model_version, m.status AS model_status, v.version AS dataset_version, d.name AS dataset_name
               FROM training_jobs j LEFT JOIN models m ON m.training_job_id = j.id
               JOIN dataset_versions v ON v.id = j.dataset_version_id JOIN datasets d ON d.id = v.dataset_id
               ORDER BY j.number DESC LIMIT ?""",
            (limit,),
        ).fetchall()
    return [_job_public(dict(r)) for r in rows]


def get_job(job_id: str) -> dict:
    with connect() as c:
        r = c.execute(
            """SELECT j.*, m.id AS model_id, m.version AS model_version, m.status AS model_status, m.name AS model_name,
                      v.version AS dataset_version, v.total_images, v.class_count, d.name AS dataset_name,
                      s.strategy AS split_strategy, s.train_count, s.val_count, s.test_count, s.seed AS split_seed
               FROM training_jobs j LEFT JOIN models m ON m.training_job_id = j.id
               JOIN dataset_versions v ON v.id = j.dataset_version_id JOIN datasets d ON d.id = v.dataset_id
               JOIN dataset_splits s ON s.id = j.split_id WHERE j.id = ?""",
            (job_id,),
        ).fetchone()
        if not r:
            raise not_found("Training job")
        epochs = [dict(e) for e in c.execute("SELECT * FROM training_epochs WHERE job_id = ? ORDER BY epoch", (job_id,))]
    out = _job_public(dict(r))
    out["epochs"] = epochs
    return out


def cancel_job(job_id: str, actor: str) -> dict:
    t = now()
    with connect() as c, transaction(c):
        r = c.execute("SELECT status FROM training_jobs WHERE id = ?", (job_id,)).fetchone()
        if not r:
            raise not_found("Training job")
        if r["status"] in TERMINAL:
            raise conflict("job_finished", f"This job has already finished ({r['status']}).")
        if r["status"] == "cancel_requested":
            return get_job(job_id)
        if r["status"] == "queued":
            c.execute("UPDATE training_jobs SET status = 'cancelled', cancel_requested_at = ?, cancel_requested_by = ?, finished_at = ?, updated_at = ? WHERE id = ?", (t, actor, t, t, job_id))
            c.execute("UPDATE models SET status = 'cancelled', status_detail = 'Cancelled before training started.' WHERE training_job_id = ?", (job_id,))
        else:
            c.execute("UPDATE training_jobs SET status = 'cancel_requested', cancel_requested_at = ?, cancel_requested_by = ?, updated_at = ? WHERE id = ?", (t, actor, t, job_id))
        audit.record(actor, "training.cancel_requested", "training_job", job_id, conn=c, previous_status=r["status"])
    return get_job(job_id)


def claim_next_job(worker_id: str) -> str | None:
    with connect() as c, transaction(c):
        r = c.execute("SELECT id FROM training_jobs WHERE status = 'queued' ORDER BY number LIMIT 1").fetchone()
        if not r:
            return None
        t = now()
        c.execute("UPDATE training_jobs SET status = 'preparing', worker_id = ?, started_at = ?, updated_at = ? WHERE id = ?", (worker_id, t, t, r["id"]))
        return r["id"]


def recover_interrupted(worker_id: str) -> None:
    """A worker starting up marks jobs another (dead) worker left running as failed — never as completed."""
    t = now()
    with connect() as c, transaction(c):
        rows = c.execute(f"SELECT id FROM training_jobs WHERE status IN ({','.join('?' * len(ACTIVE))})", ACTIVE).fetchall()
        for r in rows:
            c.execute(
                "UPDATE training_jobs SET status = 'failed', error_code = 'worker_stopped', error_message = ?, finished_at = ?, updated_at = ? WHERE id = ?",
                ("The training worker stopped before this job finished (process ended or machine restarted). Start a new training job.", t, t, r["id"]),
            )
            c.execute("UPDATE models SET status = 'failed', status_detail = 'Training was interrupted.' WHERE training_job_id = ? AND status = 'training'", (r["id"],))
            audit.record("system", "training.interrupted", "training_job", r["id"], conn=c, worker_id=worker_id)


class Cancelled(Exception):
    pass


class JobReporter:
    """Persists progress for the UI (throttled) and polls for cooperative cancellation."""

    def __init__(self, job_id: str, min_interval: float = 1.5):
        self.job_id = job_id
        self.min_interval = min_interval
        self._last_write = 0.0
        self._last_cancel_check = 0.0
        self._cancel = False

    def status(self, status: str, detail: str | None = None, **fields) -> None:
        cols = {"status": status, "status_detail": detail, "updated_at": now(), **fields}
        with connect() as c:
            # Never overwrite a pending cancel request with a normal status.
            cur = c.execute("SELECT status FROM training_jobs WHERE id = ?", (self.job_id,)).fetchone()["status"]
            if cur == "cancel_requested" and status not in TERMINAL:
                cols.pop("status")
                self._cancel = True
            sets = ", ".join(f"{k} = ?" for k in cols)
            c.execute(f"UPDATE training_jobs SET {sets} WHERE id = ?", (*cols.values(), self.job_id))

    def live(self, force: bool = False, **fields) -> None:
        t = time.monotonic()
        if not force and t - self._last_write < self.min_interval:
            return
        self._last_write = t
        live = fields.pop("live", None)
        cols = {**fields, "updated_at": now()}
        if live is not None:
            cols["live_json"] = dumps(live)
        with connect() as c:
            sets = ", ".join(f"{k} = ?" for k in cols)
            c.execute(f"UPDATE training_jobs SET {sets} WHERE id = ?", (*cols.values(), self.job_id))

    def check_cancel(self, force: bool = False) -> None:
        t = time.monotonic()
        if force or t - self._last_cancel_check > 1.0:
            self._last_cancel_check = t
            with connect() as c:
                s = c.execute("SELECT status FROM training_jobs WHERE id = ?", (self.job_id,)).fetchone()["status"]
            self._cancel = s == "cancel_requested"
        if self._cancel:
            raise Cancelled()

    def epoch(self, rec: dict) -> None:
        with connect() as c:
            c.execute(
                """INSERT OR REPLACE INTO training_epochs (job_id, epoch, train_loss, train_accuracy, val_loss, val_accuracy, val_macro_f1, learning_rate, duration_s, is_best, created_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (self.job_id, rec["epoch"], rec["train_loss"], rec["train_accuracy"], rec["val_loss"], rec["val_accuracy"], rec["val_macro_f1"], rec["learning_rate"],
                 rec["duration_s"], 1 if rec.get("is_best") else 0, now()),
            )
            if rec.get("is_best"):
                c.execute("UPDATE training_epochs SET is_best = 0 WHERE job_id = ? AND epoch <> ?", (self.job_id, rec["epoch"]))


def ensure_job_exists(job_id: str) -> dict:
    with connect() as c:
        r = c.execute("SELECT * FROM training_jobs WHERE id = ?", (job_id,)).fetchone()
    if not r:
        raise AppError(404, "not_found", "Training job was not found.")
    return dict(r)
