"""
End-to-end ML pipeline on the SYNTHETIC fixture (CPU, tiny images, 2 epochs, no pretrained download):
upload → validate → split → train → evaluate → registry → test prediction → permission gate →
deploy → farmer prediction → rollback → turn off → no-model state. Also cancel + failure paths.
"""
from __future__ import annotations

import json
import threading

import pytest

from conftest import run_worker_once, upload, wait_for
from fixtures import CLASSES, make_zip, sample_image

torch = pytest.importorskip("torch")

FAST = {"architecture": "mobilenet_v3_large", "pretrained": False, "epochs": 2, "batch_size": 16, "learning_rate": 0.001, "image_size": 64,
        "early_stopping": True, "early_stopping_patience": 3, "augmentation": True, "seed": 3, "device": "cpu", "num_workers": 0, "mixed_precision": False}


def _ready_dataset(client, admin, env, **meta):
    z = make_zip(env / f"ds_{meta.get('version', '1.0')}.zip", per_class=30)
    res = upload(client, admin, z, **meta)
    run_worker_once()
    dsv = res["create"]["id"]
    split = client.post(f"/v1/admin/datasets/versions/{dsv}/splits", json={"train_pct": 70, "val_pct": 15, "test_pct": 15, "seed": 1}, headers=admin).json()
    return dsv, split["id"]


def _train(client, admin, dsv, split, version, **cfg):
    r = client.post("/v1/admin/training/jobs", json={"dataset_version_id": dsv, "split_id": split, "model_version": version, "config": {**FAST, **cfg}}, headers=admin)
    assert r.status_code == 200, r.text
    return r.json()


def test_full_pipeline(client, admin, env):
    dsv, split = _ready_dataset(client, admin, env)
    opts = client.get(f"/v1/admin/training/options?dataset_version_id={dsv}&architecture=mobilenet_v3_large", headers=admin).json()
    assert opts["suggested_version"]["version"] == "1.0"

    job = _train(client, admin, dsv, split, "1.0")
    assert job["status"] == "queued"
    # the dataset is now locked and cannot be deleted
    assert client.get(f"/v1/admin/datasets/versions/{dsv}", headers=admin).json()["locked_at"]
    r = client.post(f"/v1/admin/datasets/versions/{dsv}/delete", json={"confirm": "1.0"}, headers=admin)
    assert r.status_code == 409

    run_worker_once()
    job = client.get(f"/v1/admin/training/jobs/{job['id']}", headers=admin).json()
    assert job["status"] == "completed", job
    assert len(job["epochs"]) == 2
    for e in job["epochs"]:
        assert e["train_loss"] is not None and e["val_loss"] is not None and 0 <= e["val_accuracy"] <= 1
    assert sum(e["is_best"] for e in job["epochs"]) == 1

    m = client.get(f"/v1/admin/models/{job['model_id']}", headers=admin).json()
    assert m["status"] == "ready"
    assert m["dataset_version_id"] == dsv and m["split_id"] == split and m["training_job_id"] == job["id"]
    ev = m["evaluation"]
    cm = ev["confusion_matrix"]["matrix"]
    assert len(cm) == 3 and sum(map(sum, cm)) == ev["test_images"] == m["test_images"]
    assert m["test_accuracy"] == ev["accuracy"]
    assert abs(sum(r[i] for i, r in enumerate(cm)) / ev["test_images"] - m["test_accuracy"]) < 1e-6
    assert {c["class_id"] for c in ev["per_class"]} == set(CLASSES)
    assert m["model_sha256"] and m["model_bytes"] > 0

    # artefact manifest carries preprocessing, classes and lineage
    from kd_backend import storage

    man = json.loads((storage.model_dir(m["id"]) / "manifest.json").read_text())
    assert man["preprocessing"]["image_size"] == 64
    assert man["dataset"]["dataset_version_id"] == dsv and man["dataset"]["split_id"] == split
    assert [c["id"] for c in man["classes"]] == sorted(CLASSES)
    assert man["weights_sha256"] == m["model_sha256"]

    # export bundle
    r = client.get(f"/v1/admin/models/{m['id']}/export", headers=admin)
    assert r.status_code == 200 and r.headers["content-type"] == "application/zip"

    # admin test prediction with the undeployed model
    r = client.post(f"/v1/admin/models/{m['id']}/predict", content=sample_image(CLASSES[0]), headers={**admin, "Content-Type": "image/jpeg"})
    assert r.status_code == 200, r.text
    p = r.json()
    assert len(p["top_predictions"]) == 3
    assert abs(sum(t["probability"] for t in p["top_predictions"]) - 1) < 1e-3  # 3 classes → top-3 covers all
    assert p["prediction"]["confidence"] == p["top_predictions"][0]["probability"]
    assert p["model"]["model_version"] == "1.0" and p["model"]["dataset_version"] == "1.0"

    # farmers get "no model" before deployment — never a fake prediction
    r = client.post("/v1/disease/predict", content=sample_image(), headers={"Content-Type": "image/jpeg"})
    assert r.status_code == 503 and r.json()["error"]["code"] == "no_model_deployed"
    assert client.get("/v1/disease/model").json()["deployed"] is False

    # deploy
    r = client.post("/v1/admin/deployment/deploy", json={"model_id": m["id"]}, headers=admin)
    assert r.status_code == 200, r.text
    assert r.json()["active"]["model_id"] == m["id"]
    card = client.get("/v1/disease/model").json()
    assert card["deployed"] and card["model"]["model_version"] == "1.0" and len(card["classes"]) == 3

    r = client.post("/v1/disease/predict", content=sample_image(CLASSES[1]), headers={"Content-Type": "image/jpeg"})
    assert r.status_code == 200, r.text
    fp = r.json()
    assert fp["model"]["model_id"] == m["id"] and fp["status"] in ("ok", "uncertain")
    assert "storage" not in json.dumps(fp) and ":\\\\" not in json.dumps(fp)  # no server paths

    # thresholds: at 0.99 almost anything is uncertain; the response says so
    client.put("/v1/admin/settings/confidence-threshold", json={"confidence_threshold": 0.99}, headers=admin)
    fp = client.post("/v1/disease/predict", content=sample_image(CLASSES[1]), headers={"Content-Type": "image/jpeg"}).json()
    assert fp["threshold"] == 0.99
    assert fp["uncertain"] == (fp["prediction"]["confidence"] < 0.99)
    assert client.put("/v1/admin/settings/confidence-threshold", json={"confidence_threshold": 1.5}, headers=admin).status_code == 400

    # invalid images
    assert client.post("/v1/disease/predict", content=b"not an image", headers={"Content-Type": "image/jpeg"}).status_code == 400
    assert client.post("/v1/disease/predict", content=b"GIF89a", headers={"Content-Type": "image/gif"}).status_code == 415

    # second model, deploy, then roll back to the first without retraining
    job2 = _train(client, admin, dsv, split, "1.1", seed=4)
    run_worker_once()
    m2 = client.get(f"/v1/admin/training/jobs/{job2['id']}", headers=admin).json()["model_id"]
    assert client.post("/v1/admin/deployment/deploy", json={"model_id": m2}, headers=admin).status_code == 200
    assert client.get("/v1/disease/model").json()["model"]["model_version"] == "1.1"
    st = client.get("/v1/admin/deployment", headers=admin).json()
    assert st["rollback_target"]["model_id"] == m["id"]
    r = client.post("/v1/admin/deployment/rollback", json={}, headers=admin)
    assert r.status_code == 200, r.text
    assert client.get("/v1/disease/model").json()["model"]["model_version"] == "1.0"
    assert client.post("/v1/disease/predict", content=sample_image(), headers={"Content-Type": "image/jpeg"}).json()["model"]["model_version"] == "1.0"

    # deployed model cannot be archived or deleted; the other can be archived but not deleted (was deployed)
    assert client.post(f"/v1/admin/models/{m['id']}/archive", headers=admin).status_code == 409
    assert client.post(f"/v1/admin/models/{m2}/delete", json={"confirm": "1.1"}, headers=admin).status_code == 409
    assert client.post(f"/v1/admin/models/{m2}/archive", headers=admin).status_code == 200

    # turn off → farmers see the unavailable state again
    assert client.post("/v1/admin/deployment/turn-off", json={"reason": "test"}, headers=admin).status_code == 200
    assert client.post("/v1/disease/predict", content=sample_image(), headers={"Content-Type": "image/jpeg"}).status_code == 503

    # audit trail recorded the important actions
    actions = {e["action"] for e in client.get("/v1/admin/audit", headers=admin).json()["entries"]}
    assert {"dataset.uploaded", "training.started", "training.completed", "deployment.deploy", "deployment.rollback", "deployment.turned_off", "model.archived"} <= actions


def test_permission_gate_and_override(client, admin, env):
    dsv, split = _ready_dataset(client, admin, env, permission_status="unknown")
    job = _train(client, admin, dsv, split, "1.0", epochs=1)
    run_worker_once()
    mid = client.get(f"/v1/admin/training/jobs/{job['id']}", headers=admin).json()["model_id"]
    m = client.get(f"/v1/admin/models/{mid}", headers=admin).json()
    assert m["deploy_block"]["code"] == "dataset_permission"
    r = client.post("/v1/admin/deployment/deploy", json={"model_id": mid}, headers=admin)
    assert r.status_code == 409 and r.json()["error"]["code"] == "permission_override_required"
    r = client.post("/v1/admin/deployment/deploy", json={"model_id": mid, "confirm_override": True, "override_reason": "short"}, headers=admin)
    assert r.status_code == 409
    r = client.post("/v1/admin/deployment/deploy", json={"model_id": mid, "confirm_override": True, "override_reason": "Pilot with written permission pending from the data owner"}, headers=admin)
    assert r.status_code == 200, r.text
    dep = r.json()["history"][0]
    assert dep["permission_override"] == 1 and dep["override_by"].startswith("tester") and dep["override_reason"].startswith("Pilot")
    actions = [e["action"] for e in client.get("/v1/admin/audit", headers=admin).json()["entries"]]
    assert "deployment.permission_override" in actions
    # fixing the provenance record removes the block for future deployments
    client.patch(f"/v1/admin/datasets/versions/{dsv}", json={"permission_status": "owned", "confirm_provenance": True}, headers=admin)
    assert client.get(f"/v1/admin/models/{mid}", headers=admin).json()["deploy_block"] is None


def test_cancel_queued_and_running(client, admin, env):
    dsv, split = _ready_dataset(client, admin, env)
    job = _train(client, admin, dsv, split, "1.0")
    r = client.post(f"/v1/admin/training/jobs/{job['id']}/cancel", headers=admin)
    assert r.json()["status"] == "cancelled"
    assert client.get(f"/v1/admin/models/{r.json()['model_id']}", headers=admin).json()["status"] == "cancelled"

    job = _train(client, admin, dsv, split, "1.1", epochs=200, early_stopping=False)
    t = threading.Thread(target=run_worker_once)
    t.start()
    wait_for(lambda: client.get(f"/v1/admin/training/jobs/{job['id']}", headers=admin).json()["status"] in ("training", "validating"))
    assert client.post(f"/v1/admin/training/jobs/{job['id']}/cancel", headers=admin).json()["status"] == "cancel_requested"
    t.join(timeout=120)
    j = client.get(f"/v1/admin/training/jobs/{job['id']}", headers=admin).json()
    assert j["status"] == "cancelled" and j["current_epoch"] < 200
    m = client.get(f"/v1/admin/models/{j['model_id']}", headers=admin).json()
    assert m["status"] == "cancelled" and m["deploy_block"]["code"] == "not_ready"
    assert client.post("/v1/admin/deployment/deploy", json={"model_id": m["id"]}, headers=admin).status_code == 409


def test_failed_training_is_not_completed(client, admin, env):
    dsv, split = _ready_dataset(client, admin, env)
    # break the dataset on disk after validation: training must fail, not "complete"
    from kd_backend import storage

    for f in list((storage.dataset_dir(dsv) / "images").rglob("*.jpg"))[:10]:
        f.write_bytes(b"corrupted")
    job = _train(client, admin, dsv, split, "1.0")
    run_worker_once()
    j = client.get(f"/v1/admin/training/jobs/{job['id']}", headers=admin).json()
    assert j["status"] == "failed" and j["error_code"] == "training_crashed"
    assert "storage" not in (j["error_message"] or "")  # server paths are redacted
    m = client.get(f"/v1/admin/models/{j['model_id']}", headers=admin).json()
    assert m["status"] == "failed" and m["test_accuracy"] is None


def test_training_validation(client, admin, env):
    dsv, split = _ready_dataset(client, admin, env)
    bad = client.post("/v1/admin/training/jobs", json={"dataset_version_id": dsv, "split_id": split, "model_version": "1.0", "config": {**FAST, "epochs": 0}}, headers=admin)
    assert bad.status_code == 422
    bad = client.post("/v1/admin/training/jobs", json={"dataset_version_id": dsv, "split_id": split, "model_version": "1.0", "config": {**FAST, "architecture": "vgg_evil"}}, headers=admin)
    assert bad.status_code == 422
    bad = client.post("/v1/admin/training/jobs", json={"dataset_version_id": dsv, "split_id": split, "model_version": "v1", "config": FAST}, headers=admin)
    assert bad.status_code == 400
    bad = client.post("/v1/admin/training/jobs", json={"dataset_version_id": dsv, "split_id": "split_nope", "model_version": "1.0", "config": FAST}, headers=admin)
    assert bad.status_code == 400
    ok = client.post("/v1/admin/training/jobs", json={"dataset_version_id": dsv, "split_id": split, "model_version": "1.0", "config": FAST}, headers=admin)
    assert ok.status_code == 200
    dup = client.post("/v1/admin/training/jobs", json={"dataset_version_id": dsv, "split_id": split, "model_version": "1.0", "config": FAST}, headers=admin)
    assert dup.status_code == 409


def test_worker_recovery_marks_interrupted_jobs_failed(client, admin, env):
    dsv, split = _ready_dataset(client, admin, env)
    job = _train(client, admin, dsv, split, "1.0")
    from kd_backend import training

    training.claim_next_job("dead-worker")  # now "preparing", as if a worker died mid-way
    training.recover_interrupted("new-worker")
    j = client.get(f"/v1/admin/training/jobs/{job['id']}", headers=admin).json()
    assert j["status"] == "failed" and j["error_code"] == "worker_stopped"
