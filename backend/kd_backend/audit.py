"""Append-only audit trail of administrator actions (who did what, to which record, when)."""
from __future__ import annotations

import sqlite3
from typing import Any

from .db import connect, dumps, now


def record(actor: str, action: str, target_type: str | None = None, target_id: str | None = None, conn: sqlite3.Connection | None = None, **details: Any) -> None:
    sql = "INSERT INTO audit_log (at, actor, action, target_type, target_id, details_json) VALUES (?, ?, ?, ?, ?, ?)"
    args = (now(), actor, action, target_type, target_id, dumps(details) if details else None)
    if conn is not None:
        conn.execute(sql, args)
        return
    with connect() as c:
        c.execute(sql, args)


def recent(limit: int = 100) -> list[dict]:
    with connect() as c:
        rows = c.execute("SELECT * FROM audit_log ORDER BY id DESC LIMIT ?", (max(1, min(limit, 500)),)).fetchall()
    from .db import loads

    return [{**dict(r), "details": loads(r["details_json"], {})} for r in rows]
