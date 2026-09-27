from __future__ import annotations

import sys
import time
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

ADMIN_KEY = "test-admin-key-0123456789abcdef"


@pytest.fixture()
def env(tmp_path, monkeypatch):
    monkeypatch.setenv("ML_STORAGE_PATH", str(tmp_path / "storage"))
    for k in ("DATASET_STORAGE_PATH", "MODEL_STORAGE_PATH", "CHECKPOINT_STORAGE_PATH", "EVALUATION_STORAGE_PATH", "TEMP_STORAGE_PATH", "ML_DATABASE_PATH", "ML_SESSION_SECRET", "SUPABASE_URL", "SUPABASE_JWT_SECRET", "ML_ADMIN_EMAILS", "ML_ADMIN_USER_IDS"):
        monkeypatch.delenv(k, raising=False)
    monkeypatch.setenv("PRETRAINED_WEIGHTS_PATH", str(tmp_path / "weights"))
    monkeypatch.setenv("ML_WORKER_AUTOSTART", "false")
    monkeypatch.setenv("ML_ADMIN_KEYS", f"tester:{ADMIN_KEY}")
    monkeypatch.setenv("TRAINING_NUM_WORKERS", "0")
    monkeypatch.setenv("TRAINING_DEVICE", "cpu")
    monkeypatch.setenv("MIN_IMAGES_PER_CLASS_WARNING", "10")
    from kd_backend import config, db, inference
    from kd_backend.api import admin as admin_api

    config.reset_settings()
    db.reset_db_cache()
    inference._cache.clear()
    admin_api._login_limiter._hits.clear()
    yield tmp_path
    config.reset_settings()
    db.reset_db_cache()
    inference._cache.clear()


@pytest.fixture()
def client(env):
    from fastapi.testclient import TestClient

    from kd_backend.api.app import create_app

    with TestClient(create_app()) as c:
        yield c


@pytest.fixture()
def admin(client):
    r = client.post("/v1/admin/session", json={"key": ADMIN_KEY})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


PROVENANCE = {
    "source": "Synthetic test fixture",
    "owner": "Test suite",
    "license": "Test only",
    "permission_status": "owned",
    "collection_method": "Generated in memory",
    "confirm_provenance": True,
}


def upload(client, headers, zip_path: Path, *, name: str = "Fixture set", version: str = "1.0", dataset_id: str | None = None, **meta) -> dict:
    data = zip_path.read_bytes()
    body = {**PROVENANCE, **meta, "version": version, "original_filename": zip_path.name, "size_bytes": len(data)}
    if dataset_id:
        body["dataset_id"] = dataset_id
    else:
        body["dataset_name"] = name
    r = client.post("/v1/admin/datasets/versions", json=body, headers=headers)
    assert r.status_code == 200, r.text
    dsv = r.json()
    r = client.put(f"/v1/admin/datasets/versions/{dsv['id']}/archive", content=data, headers={**headers, "Content-Type": "application/zip"})
    return {"create": dsv, "upload": r}


def run_worker_once() -> None:
    """Process everything queued, synchronously (what the worker loop does)."""
    from kd_backend import training
    from kd_backend.datasets import service as datasets
    from kd_backend.ml.trainer import run_job

    while True:
        dsv = datasets.claim_next_ingest()
        if dsv:
            datasets.ingest(dsv)
            continue
        job = training.claim_next_job("test-worker")
        if job:
            run_job(job)
            continue
        break


def wait_for(fn, timeout: float = 60, interval: float = 0.2):
    t = time.monotonic()
    while time.monotonic() - t < timeout:
        v = fn()
        if v:
            return v
        time.sleep(interval)
    raise AssertionError("timed out")
