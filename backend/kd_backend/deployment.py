"""
Deployment manager. Training produces models; deployment chooses which ONE model serves farmers.

* Deploy: the model must be Ready with a verified artefact, and must load successfully before the
  switch (otherwise nothing changes). The previous active deployment is marked superseded.
* Permission gate: if the training dataset's permission status is "Permission required" or "Unknown",
  deployment is refused unless the admin explicitly overrides it with a written reason — the override
  (who, when, why) is stored on the deployment and in the audit log.
* Rollback: re-activates the model of the previous deployment (no retraining). The same gates apply.
* Turn off: ends the active deployment; the farmer UI then shows "unavailable" rather than guessing.
"""
from __future__ import annotations

from . import audit, inference, registry
from .db import connect, new_id, next_number, now, transaction
from .errors import AppError, bad_request, conflict, not_found

ENV = "production"


def history(limit: int = 50) -> list[dict]:
    with connect() as c:
        rows = c.execute(
            """SELECT dp.*, m.version AS model_version, m.name AS model_name, m.status AS model_status, v.version AS dataset_version, d.name AS dataset_name
               FROM model_deployments dp LEFT JOIN models m ON m.id = dp.model_id
               LEFT JOIN dataset_versions v ON v.id = m.dataset_version_id LEFT JOIN datasets d ON d.id = v.dataset_id
               WHERE dp.environment = ? ORDER BY dp.number DESC LIMIT ?""",
            (ENV, limit),
        ).fetchall()
    return [dict(r) for r in rows]


def state() -> dict:
    active = inference.active_deployment(ENV)
    return {"environment": ENV, "active": active, "history": history(), "rollback_target": _rollback_target(), "confidence_threshold": inference.confidence_threshold()}


def _rollback_target() -> dict | None:
    """The most recent earlier deployment whose model is different from the active one and still deployable."""
    active = inference.active_deployment(ENV)
    with connect() as c:
        rows = c.execute(
            """SELECT dp.id, dp.number, dp.model_id, m.version, m.status FROM model_deployments dp JOIN models m ON m.id = dp.model_id
               WHERE dp.environment = ? AND dp.status = 'superseded' ORDER BY dp.number DESC""",
            (ENV,),
        ).fetchall()
    for r in rows:
        if active and r["model_id"] == active["model_id"]:
            continue
        if r["status"] == "ready":
            return {"deployment_id": r["id"], "deployment_number": r["number"], "model_id": r["model_id"], "model_version": r["version"]}
    return None


def deploy(model_id: str, actor: str, *, override_reason: str | None = None, confirm_override: bool = False, action: str = "deploy", note: str | None = None) -> dict:
    m = registry.model_row(model_id)
    block = registry.deploy_block(m)
    override = False
    if block:
        if not block["overridable"]:
            raise conflict(block["code"], block["message"])
        reason = (override_reason or "").strip()
        if not confirm_override or len(reason) < 10:
            raise AppError(409, "permission_override_required", block["message"], {"overridable": True})
        override = True
    active = inference.active_deployment(ENV)
    if active and active["model_id"] == model_id:
        raise conflict("already_active", f"{m['name']} v{m['version']} is already the active production model.")

    inference.verify_loadable(model_id)  # raises 503 model_load_failed — nothing is switched

    t = now()
    with connect() as c, transaction(c):
        cur = c.execute("SELECT id, model_id FROM model_deployments WHERE environment = ? AND status = 'active'", (ENV,)).fetchall()
        for r in cur:
            c.execute("UPDATE model_deployments SET status = 'superseded', ended_at = ? WHERE id = ?", (t, r["id"]))
            if r["model_id"]:
                c.execute("UPDATE models SET status = 'ready' WHERE id = ? AND status = 'deployed'", (r["model_id"],))
        dep_id = new_id("dep")
        number = next_number(c, "model_deployments")
        c.execute(
            """INSERT INTO model_deployments (id, number, model_id, environment, action, status, deployed_by, deployed_at, previous_deployment_id,
                   permission_override, override_by, override_at, override_reason, note) VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?, ?)""",
            (dep_id, number, model_id, ENV, action, actor, t, cur[0]["id"] if cur else None, 1 if override else 0,
             actor if override else None, t if override else None, (override_reason or "").strip()[:1000] if override else None, (note or "").strip()[:500] or None),
        )
        c.execute("UPDATE models SET status = 'deployed' WHERE id = ?", (model_id,))
        audit.record(actor, f"deployment.{action}", "model", model_id, conn=c, deployment_id=dep_id, number=number, model_version=m["version"],
                     previous_deployment_id=cur[0]["id"] if cur else None)
        if override:
            audit.record(actor, "deployment.permission_override", "model", model_id, conn=c, deployment_id=dep_id,
                         permission_status=m["permission_status"], reason=(override_reason or "").strip()[:1000])
    return state()


def rollback(actor: str, target_deployment_id: str | None = None, **kw) -> dict:
    if target_deployment_id:
        with connect() as c:
            r = c.execute("SELECT model_id FROM model_deployments WHERE id = ? AND environment = ?", (target_deployment_id, ENV)).fetchone()
        if not r or not r["model_id"]:
            raise not_found("Deployment")
        model_id = r["model_id"]
    else:
        t = _rollback_target()
        if not t:
            raise conflict("no_rollback_target", "There is no earlier deployed model to roll back to.")
        model_id = t["model_id"]
    return deploy(model_id, actor, action="rollback", **kw)


def turn_off(actor: str, reason: str | None) -> dict:
    t = now()
    with connect() as c, transaction(c):
        cur = c.execute("SELECT id, model_id FROM model_deployments WHERE environment = ? AND status = 'active'", (ENV,)).fetchall()
        if not cur:
            raise conflict("nothing_active", "No model is currently deployed.")
        for r in cur:
            c.execute("UPDATE model_deployments SET status = 'superseded', ended_at = ? WHERE id = ?", (t, r["id"]))
            c.execute("UPDATE models SET status = 'ready' WHERE id = ? AND status = 'deployed'", (r["model_id"],))
        audit.record(actor, "deployment.turned_off", "deployment", cur[0]["id"], conn=c, model_id=cur[0]["model_id"], reason=(reason or "")[:500])
    return state()


def set_threshold(value: float, actor: str) -> dict:
    if not isinstance(value, (int, float)) or not (0.05 <= float(value) <= 0.99):
        raise bad_request("invalid_threshold", "The confidence threshold must be between 0.05 and 0.99.")
    old = inference.confidence_threshold()
    with connect() as c:
        c.execute(
            "INSERT INTO settings (key, value, updated_by, updated_at) VALUES ('confidence_threshold', ?, ?, ?) "
            "ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_by = excluded.updated_by, updated_at = excluded.updated_at",
            (str(round(float(value), 4)), actor, now()),
        )
    audit.record(actor, "settings.confidence_threshold", "settings", "confidence_threshold", before=old, after=round(float(value), 4))
    return state()
