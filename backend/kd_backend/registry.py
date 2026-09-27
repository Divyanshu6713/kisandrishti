"""
Model registry: every trained model with its lineage, metrics and lifecycle state.

Model states:
    training → ready → deployed ⇄ ready → archived
             ↘ failed | evaluation_failed | cancelled
Only `ready` (or the currently `deployed`) models with a verified artefact can serve predictions.
"Blocked by dataset permission" is computed from the dataset version's *current* permission status,
so fixing the provenance record unblocks deployment without editing the model.
"""
from __future__ import annotations

from . import audit, storage
from .db import connect, loads, now, transaction
from .errors import conflict, not_found

BLOCKING_PERMISSIONS = {"permission_required": "Permission required", "unknown": "Unknown"}
PERMISSION_LABELS = {
    "owned": "Owned/collected by Kisan Drishti",
    "licensed_commercial": "Licensed for commercial use",
    "research_only": "Research/non-commercial only",
    "permission_required": "Permission required",
    "unknown": "Unknown",
}

_BASE = """
SELECT m.*, v.version AS dataset_version, v.permission_status, v.content_hash AS dataset_content_hash, d.name AS dataset_name, d.id AS dataset_id,
       j.number AS job_number, j.status AS job_status, j.best_epoch, j.early_stopped, j.device AS train_device, j.device_name AS train_device_name,
       s.strategy AS split_strategy, s.seed AS split_seed,
       (SELECT COUNT(*) FROM model_deployments dp WHERE dp.model_id = m.id) AS deployment_count,
       (SELECT dp.id FROM model_deployments dp WHERE dp.model_id = m.id AND dp.status = 'active') AS active_deployment_id
FROM models m
JOIN dataset_versions v ON v.id = m.dataset_version_id
JOIN datasets d ON d.id = v.dataset_id
JOIN training_jobs j ON j.id = m.training_job_id
JOIN dataset_splits s ON s.id = m.split_id
"""


def deploy_block(m: dict) -> dict | None:
    if m["status"] not in ("ready", "deployed"):
        return {"code": "not_ready", "message": f"Only evaluated models in the “Ready” state can be deployed (this model is “{m['status']}”).", "overridable": False}
    if not m.get("model_sha256"):
        return {"code": "artifact_missing", "message": "This model has no saved artefact.", "overridable": False}
    if m["permission_status"] in BLOCKING_PERMISSIONS:
        return {
            "code": "dataset_permission",
            "message": f"Blocked by dataset permission: the training dataset's permission status is “{BLOCKING_PERMISSIONS[m['permission_status']]}”. "
                       "Update the dataset's provenance record, or deploy with an explicit, recorded override.",
            "overridable": True,
        }
    return None


def _public(r: dict, full: bool = False) -> dict:
    d = dict(r)
    d["classes"] = loads(d.pop("classes_json"), [])
    d["config"] = loads(d.pop("config_json"), {})
    d["preprocessing"] = loads(d.pop("preprocessing_json", None))
    d["augmentation"] = loads(d.pop("augmentation_json", None))
    ev = loads(d.pop("evaluation_json", None))
    if full:
        d["evaluation"] = ev
    else:
        d["top3_accuracy"] = ev.get("top3_accuracy") if ev else None
    d.pop("model_path", None)
    d["is_active"] = d["active_deployment_id"] is not None
    d["permission_label"] = PERMISSION_LABELS.get(d["permission_status"], d["permission_status"])
    d["deploy_block"] = deploy_block(d)
    d["permission_warning"] = (
        "Research/non-commercial only: check the licence before using this model in a commercial product." if d["permission_status"] == "research_only" else None
    )
    return d


def list_models() -> list[dict]:
    with connect() as c:
        rows = c.execute(_BASE + " ORDER BY m.created_at DESC").fetchall()
    return [_public(dict(r)) for r in rows]


def get_model(model_id: str) -> dict:
    with connect() as c:
        r = c.execute(_BASE + " WHERE m.id = ?", (model_id,)).fetchone()
        if not r:
            raise not_found("Model")
        deps = [dict(x) for x in c.execute("SELECT * FROM model_deployments WHERE model_id = ? ORDER BY number DESC", (model_id,))]
    out = _public(dict(r), full=True)
    out["deployments"] = deps
    out["artifact_present"] = bool(r["model_path"]) and (storage.resolve(r["model_path"]) / "model.pt").is_file()
    return out


def model_row(model_id: str) -> dict:
    with connect() as c:
        r = c.execute(_BASE + " WHERE m.id = ?", (model_id,)).fetchone()
    if not r:
        raise not_found("Model")
    return dict(r)


def archive(model_id: str, actor: str) -> dict:
    with connect() as c, transaction(c):
        r = c.execute("SELECT status FROM models WHERE id = ?", (model_id,)).fetchone()
        if not r:
            raise not_found("Model")
        if r["status"] == "deployed":
            raise conflict("model_deployed", "This model is serving predictions. Deploy another model (or turn off the production model) before archiving it.")
        if r["status"] == "training":
            raise conflict("model_training", "This model is still training. Cancel the training job first.")
        if r["status"] == "archived":
            return get_model(model_id)
        c.execute("UPDATE models SET status = 'archived', archived_at = ?, archived_by = ?, status_detail = ? WHERE id = ?", (now(), actor, f"was {r['status']}", model_id))
        audit.record(actor, "model.archived", "model", model_id, conn=c, previous_status=r["status"])
    return get_model(model_id)


def unarchive(model_id: str, actor: str) -> dict:
    with connect() as c, transaction(c):
        r = c.execute("SELECT status, status_detail, model_sha256 FROM models WHERE id = ?", (model_id,)).fetchone()
        if not r:
            raise not_found("Model")
        if r["status"] != "archived":
            raise conflict("not_archived", "Only archived models can be restored.")
        prev = (r["status_detail"] or "").removeprefix("was ") or "ready"
        restored = prev if prev in ("ready", "failed", "evaluation_failed", "cancelled") else ("ready" if r["model_sha256"] else "failed")
        c.execute("UPDATE models SET status = ?, archived_at = NULL, archived_by = NULL, status_detail = NULL WHERE id = ?", (restored, model_id))
        audit.record(actor, "model.unarchived", "model", model_id, conn=c, restored_status=restored)
    return get_model(model_id)


def delete(model_id: str, actor: str, confirm_version: str) -> None:
    """Deletes artefacts + record. Refused for any model that was ever deployed (rollback history must stay valid)."""
    with connect() as c, transaction(c):
        r = c.execute("SELECT * FROM models WHERE id = ?", (model_id,)).fetchone()
        if not r:
            raise not_found("Model")
        if confirm_version != r["version"]:
            raise conflict("confirmation_mismatch", "Type the model version exactly to confirm deletion.")
        if r["status"] in ("deployed", "training"):
            raise conflict("model_in_use", "A deployed or training model cannot be deleted.")
        if c.execute("SELECT 1 FROM model_deployments WHERE model_id = ?", (model_id,)).fetchone():
            raise conflict("model_has_deployments", "This model has been deployed before. It is kept (archive it instead) so the deployment history and rollbacks stay valid.")
        c.execute("DELETE FROM prediction_logs WHERE model_id = ?", (model_id,))
        c.execute("DELETE FROM models WHERE id = ?", (model_id,))  # the training job record stays as history
        audit.record(actor, "model.deleted", "model", model_id, conn=c, version=r["version"], training_job_id=r["training_job_id"], dataset_version_id=r["dataset_version_id"])
    storage.remove_tree(storage.model_dir(model_id))
    storage.remove_tree(storage.evaluation_dir(model_id))
