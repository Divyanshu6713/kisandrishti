"""
Administrator API. Every route depends on `require_admin`, which verifies the bearer token on the
server (security.py). Nothing here is reachable by farmer accounts.
"""
from __future__ import annotations

import hashlib
import re
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import Response
from pydantic import BaseModel, ConfigDict, Field
from starlette.requests import ClientDisconnect

from .. import audit, deployment, inference, registry, storage, training
from ..config import get_settings
from ..datasets import service as datasets
from ..db import connect, loads, now
from ..errors import AppError, bad_request, conflict
from ..ml.artifact import export_zip
from ..security import Admin, RateLimiter, authenticate, check_admin_key, issue_session
from .util import client_ip, read_body_limited

router = APIRouter()
_login_limiter = RateLimiter(10, 600)


def require_admin(request: Request) -> Admin:
    return authenticate(request.headers.get("authorization"))


# ------------------------------------------------------------------ session


class SessionIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    key: str = Field(min_length=1, max_length=512)


@router.post("/session")
def create_session(body: SessionIn, request: Request):
    if not get_settings().admin_keys:
        raise AppError(503, "admin_keys_not_configured", "Admin-key sign-in is not configured on this server (set ML_ADMIN_KEYS).")
    ip = client_ip(request)
    if not _login_limiter.allow(ip, record=False):  # only failed attempts count towards the limit
        raise AppError(429, "rate_limited", "Too many failed sign-in attempts. Wait a few minutes and try again.")
    name = check_admin_key(body.key)
    if not name:
        _login_limiter.record_hit(ip)
        audit.record(f"unknown ({ip})", "admin.sign_in_failed")
        raise AppError(401, "invalid_key", "That admin key is not valid.")
    token, exp = issue_session(name)
    audit.record(f"{name} (key)", "admin.signed_in")
    return {"token": token, "expires_at": exp, "admin": {"name": name, "method": "key"}}


@router.get("/me")
def me(admin: Admin = Depends(require_admin)):
    return {"admin": {"name": admin.name, "method": admin.method}}


# ------------------------------------------------------------------ overview


def _worker_status() -> dict:
    cutoff = (datetime.now(timezone.utc) - timedelta(seconds=30)).isoformat(timespec="seconds").replace("+00:00", "Z")
    with connect() as c:
        rows = [dict(r) for r in c.execute("SELECT worker_id, host, device, device_name, last_seen, current_task FROM worker_heartbeat ORDER BY last_seen DESC")]
    live = [r for r in rows if r["last_seen"] >= cutoff]
    return {"online": bool(live), "workers": live, "last_seen": rows[0]["last_seen"] if rows else None}


@router.get("/overview")
def overview(admin: Admin = Depends(require_admin)):
    with connect() as c:
        model_counts = {r["status"]: r["n"] for r in c.execute("SELECT status, COUNT(*) AS n FROM models GROUP BY status")}
        ds_counts = {r["status"]: r["n"] for r in c.execute("SELECT status, COUNT(*) AS n FROM dataset_versions GROUP BY status")}
        last_trained = c.execute("SELECT MAX(trained_at) AS t FROM models WHERE trained_at IS NOT NULL").fetchone()["t"]
        since = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat(timespec="seconds").replace("+00:00", "Z")
        p = c.execute(
            "SELECT COUNT(*) AS n, SUM(uncertain) AS u, AVG(inference_ms) AS ms FROM prediction_logs WHERE source = 'farmer' AND created_at >= ?", (since,)
        ).fetchone()
        warn_rows = c.execute(
            """SELECT v.id, v.version, v.status, v.validation_json, d.name FROM dataset_versions v JOIN datasets d ON d.id = v.dataset_id
               WHERE v.status IN ('ready_with_warnings', 'invalid', 'failed') ORDER BY v.updated_at DESC LIMIT 5"""
        ).fetchall()
    active = inference.active_deployment()
    active_model = registry.get_model(active["model_id"]) if active else None
    dataset_warnings = []
    for r in warn_rows:
        v = loads(r["validation_json"], {}) or {}
        dataset_warnings.append({"dataset_version_id": r["id"], "dataset_name": r["name"], "version": r["version"], "status": r["status"],
                                 "warnings": [w for w in v.get("warnings", []) if w["severity"] != "info"][:3]})
    return {
        "active": active,
        "active_model": {k: active_model[k] for k in ("id", "name", "version", "status", "class_count", "test_accuracy", "f1_macro", "architecture", "dataset_name", "dataset_version", "trained_at")} if active_model else None,
        "model_counts": model_counts,
        "dataset_counts": ds_counts,
        "last_training_completed_at": last_trained,
        "recent_jobs": training.list_jobs(5),
        "dataset_warnings": dataset_warnings,
        "worker": _worker_status(),
        "confidence_threshold": inference.confidence_threshold(),
        "predictions_7d": {"count": p["n"] or 0, "uncertain": int(p["u"] or 0), "avg_inference_ms": round(p["ms"], 1) if p["ms"] is not None else None},
        "limits": {"max_upload_bytes": get_settings().max_upload_bytes},
    }


# ------------------------------------------------------------------ datasets


class DatasetVersionIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    dataset_id: str | None = None
    dataset_name: str | None = Field(None, max_length=120)
    dataset_description: str | None = Field(None, max_length=2000)
    version: str = Field(max_length=32)
    description: str | None = Field(None, max_length=2000)
    source: str = Field(max_length=500)
    owner: str = Field(max_length=200)
    license: str = Field(max_length=500)
    permission_status: str
    collection_method: str | None = Field(None, max_length=500)
    notes: str | None = Field(None, max_length=2000)
    original_filename: str = Field(max_length=255)
    size_bytes: int
    confirm_provenance: bool = False


@router.get("/datasets")
def list_datasets(admin: Admin = Depends(require_admin)):
    return {"datasets": datasets.list_datasets(), "limits": {"max_upload_bytes": get_settings().max_upload_bytes}}


@router.post("/datasets/versions")
def create_dataset_version(body: DatasetVersionIn, admin: Admin = Depends(require_admin)):
    return datasets.create_version(body.model_dump(), admin.actor)


@router.put("/datasets/versions/{dsv_id}/archive")
async def upload_archive(dsv_id: str, request: Request, admin: Admin = Depends(require_admin)):
    """Streams the ZIP to temp storage (never into memory), with a hard size cap and a SHA-256 of the bytes."""
    row = await run_in_threadpool(datasets.begin_upload, dsv_id)
    declared = int(row["upload_bytes"])
    limit = min(declared, get_settings().max_upload_bytes)
    cl = request.headers.get("content-length")
    if cl and cl.isdigit() and int(cl) != declared:
        datasets.mark_upload(dsv_id, "upload_failed", detail="The upload size does not match the declared archive size.")
        raise bad_request("size_mismatch", "The upload size does not match the declared archive size.")
    part = storage.upload_part(dsv_id)
    h = hashlib.sha256()
    received = 0
    try:
        with open(part, "wb") as f:
            async for chunk in request.stream():
                received += len(chunk)
                if received > limit:
                    raise AppError(413, "too_large", "The upload is larger than declared or over the size limit.")
                h.update(chunk)
                f.write(chunk)
    except (ClientDisconnect, OSError, AppError) as e:
        part.unlink(missing_ok=True)
        msg = e.message if isinstance(e, AppError) else "The upload was interrupted. Try again."
        datasets.mark_upload(dsv_id, "upload_failed", received=received, detail=msg)
        if isinstance(e, AppError):
            raise
        raise AppError(400, "upload_interrupted", msg)
    if received != declared:
        part.unlink(missing_ok=True)
        datasets.mark_upload(dsv_id, "upload_failed", received=received, detail="The upload ended early.")
        raise bad_request("upload_incomplete", f"Only {received:,} of {declared:,} bytes arrived. Try the upload again.")
    with open(part, "rb") as f:
        magic = f.read(4)
    if magic[:2] != b"PK":
        part.unlink(missing_ok=True)
        datasets.mark_upload(dsv_id, "invalid", received=received, detail="The file is not a ZIP archive.")
        raise AppError(415, "not_a_zip", "The file is not a ZIP archive.")
    datasets.mark_upload(dsv_id, "queued", received=received, sha=h.hexdigest(), detail="Waiting for the worker to validate the archive")
    audit.record(admin.actor, "dataset.uploaded", "dataset_version", dsv_id, bytes=received, sha256=h.hexdigest())
    return datasets.get_version(dsv_id)


@router.get("/datasets/versions/{dsv_id}")
def get_dataset_version(dsv_id: str, admin: Admin = Depends(require_admin)):
    return datasets.get_version(dsv_id)


class ProvenanceIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    description: str | None = Field(None, max_length=2000)
    source: str | None = Field(None, max_length=500)
    owner: str | None = Field(None, max_length=200)
    license: str | None = Field(None, max_length=500)
    permission_status: str | None = None
    collection_method: str | None = Field(None, max_length=500)
    notes: str | None = Field(None, max_length=2000)
    confirm_provenance: bool = False


@router.patch("/datasets/versions/{dsv_id}")
def update_dataset_version(dsv_id: str, body: ProvenanceIn, admin: Admin = Depends(require_admin)):
    return datasets.update_provenance(dsv_id, body.model_dump(exclude_unset=True), admin.actor)


class DeleteIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    confirm: str


@router.post("/datasets/versions/{dsv_id}/delete")
def delete_dataset_version(dsv_id: str, body: DeleteIn, admin: Admin = Depends(require_admin)):
    v = datasets.get_version(dsv_id)
    if body.confirm != v["version"]:
        raise conflict("confirmation_mismatch", "Type the dataset version exactly to confirm deletion.")
    datasets.delete_version(dsv_id, admin.actor)
    return {"deleted": True}


class SplitIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    train_pct: float = 70
    val_pct: float = 15
    test_pct: float = 15
    seed: int = 42


@router.post("/datasets/versions/{dsv_id}/splits")
async def create_split(dsv_id: str, body: SplitIn, admin: Admin = Depends(require_admin)):
    split = await run_in_threadpool(datasets.create_split, dsv_id, body.train_pct, body.val_pct, body.test_pct, body.seed, admin.actor)
    return split


# ------------------------------------------------------------------ training


@router.get("/training/options")
def training_options(dataset_version_id: str | None = None, architecture: str = "efficientnet_b0", admin: Admin = Depends(require_admin)):
    return {**training.options(), "suggested_version": training.suggest_version(dataset_version_id, architecture), "worker": _worker_status()}


@router.post("/training/jobs")
def create_job(body: training.CreateJob, admin: Admin = Depends(require_admin)):
    return training.create_job(body, admin.actor)


@router.get("/training/jobs")
def list_jobs(admin: Admin = Depends(require_admin)):
    return {"jobs": training.list_jobs(100), "worker": _worker_status()}


@router.get("/training/jobs/{job_id}")
def get_job(job_id: str, admin: Admin = Depends(require_admin)):
    return {**training.get_job(job_id), "worker": _worker_status()}


@router.post("/training/jobs/{job_id}/cancel")
def cancel_job(job_id: str, admin: Admin = Depends(require_admin)):
    return training.cancel_job(job_id, admin.actor)


# ------------------------------------------------------------------ models


@router.get("/models")
def list_models(admin: Admin = Depends(require_admin)):
    return {"models": registry.list_models(), "active": inference.active_deployment()}


@router.get("/models/{model_id}")
def get_model(model_id: str, admin: Admin = Depends(require_admin)):
    return registry.get_model(model_id)


@router.post("/models/{model_id}/archive")
def archive_model(model_id: str, admin: Admin = Depends(require_admin)):
    return registry.archive(model_id, admin.actor)


@router.post("/models/{model_id}/unarchive")
def unarchive_model(model_id: str, admin: Admin = Depends(require_admin)):
    return registry.unarchive(model_id, admin.actor)


@router.post("/models/{model_id}/delete")
def delete_model(model_id: str, body: DeleteIn, admin: Admin = Depends(require_admin)):
    registry.delete(model_id, admin.actor, body.confirm)
    inference.evict(model_id)
    return {"deleted": True}


@router.get("/models/{model_id}/export")
def export_model(model_id: str, admin: Admin = Depends(require_admin)):
    m = registry.model_row(model_id)
    if not m["model_path"]:
        raise conflict("artifact_missing", "This model has no saved artefact to export.")
    data = export_zip(storage.resolve(m["model_path"]))
    audit.record(admin.actor, "model.exported", "model", model_id, version=m["version"])
    safe = re.sub(r"[^0-9A-Za-z._-]", "_", m["version"])
    return Response(data, media_type="application/zip", headers={"Content-Disposition": f'attachment; filename="kd-disease-model-v{safe}.zip"'})


@router.post("/models/{model_id}/predict")
async def test_predict(model_id: str, request: Request, admin: Admin = Depends(require_admin)):
    ctype = (request.headers.get("content-type") or "").split(";")[0].strip().lower()
    if ctype not in ("image/jpeg", "image/png", "image/webp"):
        raise AppError(415, "unsupported_type", "Please use a JPG, PNG or WebP image.")
    data = await read_body_limited(request, get_settings().max_predict_bytes)
    return await run_in_threadpool(inference.predict_with, model_id, data)


# ------------------------------------------------------------------ deployment


class DeployIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    model_id: str
    confirm_override: bool = False
    override_reason: str | None = Field(None, max_length=1000)
    note: str | None = Field(None, max_length=500)


class RollbackIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    deployment_id: str | None = None
    confirm_override: bool = False
    override_reason: str | None = Field(None, max_length=1000)
    note: str | None = Field(None, max_length=500)


class TurnOffIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    reason: str | None = Field(None, max_length=500)


class ThresholdIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    confidence_threshold: float


@router.get("/deployment")
def deployment_state(admin: Admin = Depends(require_admin)):
    return deployment.state()


@router.post("/deployment/deploy")
async def deploy(body: DeployIn, admin: Admin = Depends(require_admin)):
    return await run_in_threadpool(lambda: deployment.deploy(body.model_id, admin.actor, override_reason=body.override_reason, confirm_override=body.confirm_override, note=body.note))


@router.post("/deployment/rollback")
async def rollback(body: RollbackIn, admin: Admin = Depends(require_admin)):
    return await run_in_threadpool(lambda: deployment.rollback(admin.actor, body.deployment_id, override_reason=body.override_reason, confirm_override=body.confirm_override, note=body.note))


@router.post("/deployment/turn-off")
def turn_off(body: TurnOffIn, admin: Admin = Depends(require_admin)):
    return deployment.turn_off(admin.actor, body.reason)


@router.put("/settings/confidence-threshold")
def set_threshold(body: ThresholdIn, admin: Admin = Depends(require_admin)):
    return deployment.set_threshold(body.confidence_threshold, admin.actor)


@router.get("/audit")
def audit_log(limit: int = 100, admin: Admin = Depends(require_admin)):
    return {"entries": audit.recent(limit), "generated_at": now()}
