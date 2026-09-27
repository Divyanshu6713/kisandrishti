"""
Metadata database. SQLite (stdlib) for the MVP: one file, WAL mode, foreign keys on.

All access goes through `connect()`; SQL stays in the service modules that own each table. The
schema is plain SQL with stable text IDs, so moving to Postgres later is a driver change plus
these CREATE statements — not a redesign.

Lineage is enforced with foreign keys:
    dataset_versions → dataset_splits → training_jobs → models → model_deployments
"""
from __future__ import annotations

import json
import sqlite3
import threading
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Any, Iterator

from .config import get_settings

PERMISSION_STATUSES = (
    "owned",  # Owned/collected by Kisan Drishti
    "licensed_commercial",  # Licensed for commercial use
    "research_only",  # Research/non-commercial only
    "permission_required",  # Permission required
    "unknown",  # Unknown
)

MIGRATIONS: list[str] = [
    # 1 — initial schema
    """
    CREATE TABLE datasets (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        description TEXT,
        created_by TEXT NOT NULL,
        created_at TEXT NOT NULL
    );

    CREATE TABLE dataset_versions (
        id TEXT PRIMARY KEY,
        dataset_id TEXT NOT NULL REFERENCES datasets(id),
        version TEXT NOT NULL,
        description TEXT,
        source TEXT,
        owner TEXT,
        license TEXT,
        permission_status TEXT NOT NULL,
        collection_method TEXT,
        notes TEXT,
        original_filename TEXT,
        upload_bytes INTEGER,
        received_bytes INTEGER NOT NULL DEFAULT 0,
        archive_sha256 TEXT,
        status TEXT NOT NULL,
        status_detail TEXT,
        progress REAL,
        structure TEXT,
        storage_path TEXT,
        total_images INTEGER,
        class_count INTEGER,
        total_bytes INTEGER,
        content_hash TEXT,
        validation_json TEXT,
        locked_at TEXT,
        uploaded_by TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE (dataset_id, version)
    );

    CREATE TABLE dataset_classes (
        dataset_version_id TEXT NOT NULL REFERENCES dataset_versions(id) ON DELETE CASCADE,
        class_index INTEGER NOT NULL,
        raw_name TEXT NOT NULL,
        display_name TEXT NOT NULL,
        image_count INTEGER NOT NULL,
        PRIMARY KEY (dataset_version_id, raw_name)
    );

    CREATE TABLE dataset_splits (
        id TEXT PRIMARY KEY,
        dataset_version_id TEXT NOT NULL REFERENCES dataset_versions(id),
        strategy TEXT NOT NULL,
        train_pct REAL, val_pct REAL, test_pct REAL,
        seed INTEGER,
        train_count INTEGER NOT NULL,
        val_count INTEGER NOT NULL,
        test_count INTEGER NOT NULL,
        per_class_json TEXT NOT NULL,
        warnings_json TEXT NOT NULL,
        manifest_path TEXT NOT NULL,
        manifest_sha256 TEXT NOT NULL,
        created_by TEXT NOT NULL,
        created_at TEXT NOT NULL
    );

    CREATE TABLE training_jobs (
        id TEXT PRIMARY KEY,
        number INTEGER NOT NULL UNIQUE,
        dataset_version_id TEXT NOT NULL REFERENCES dataset_versions(id),
        split_id TEXT NOT NULL REFERENCES dataset_splits(id),
        config_json TEXT NOT NULL,
        status TEXT NOT NULL,
        status_detail TEXT,
        error_code TEXT,
        error_message TEXT,
        current_epoch INTEGER NOT NULL DEFAULT 0,
        total_epochs INTEGER NOT NULL,
        batch_index INTEGER,
        batches_per_epoch INTEGER,
        overall_progress REAL NOT NULL DEFAULT 0,
        live_json TEXT,
        device TEXT,
        device_name TEXT,
        best_epoch INTEGER,
        early_stopped INTEGER NOT NULL DEFAULT 0,
        cancel_requested_at TEXT,
        cancel_requested_by TEXT,
        worker_id TEXT,
        created_by TEXT NOT NULL,
        created_at TEXT NOT NULL,
        started_at TEXT,
        finished_at TEXT,
        updated_at TEXT NOT NULL
    );

    CREATE TABLE training_epochs (
        job_id TEXT NOT NULL REFERENCES training_jobs(id) ON DELETE CASCADE,
        epoch INTEGER NOT NULL,
        train_loss REAL, train_accuracy REAL,
        val_loss REAL, val_accuracy REAL, val_macro_f1 REAL,
        learning_rate REAL,
        duration_s REAL,
        is_best INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        PRIMARY KEY (job_id, epoch)
    );

    CREATE TABLE models (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        version TEXT NOT NULL UNIQUE,
        training_job_id TEXT NOT NULL UNIQUE REFERENCES training_jobs(id),
        dataset_version_id TEXT NOT NULL REFERENCES dataset_versions(id),
        split_id TEXT NOT NULL REFERENCES dataset_splits(id),
        architecture TEXT NOT NULL,
        framework TEXT NOT NULL,
        framework_version TEXT,
        status TEXT NOT NULL,
        status_detail TEXT,
        class_count INTEGER NOT NULL,
        classes_json TEXT NOT NULL,
        preprocessing_json TEXT,
        augmentation_json TEXT,
        config_json TEXT NOT NULL,
        training_images INTEGER, validation_images INTEGER, test_images INTEGER,
        epochs_configured INTEGER, epochs_completed INTEGER,
        batch_size INTEGER, learning_rate REAL, image_size INTEGER, random_seed INTEGER,
        test_accuracy REAL,
        precision_macro REAL, recall_macro REAL, f1_macro REAL,
        precision_weighted REAL, recall_weighted REAL, f1_weighted REAL,
        evaluation_json TEXT,
        model_path TEXT,
        model_sha256 TEXT,
        model_bytes INTEGER,
        training_duration_s REAL,
        created_by TEXT NOT NULL,
        created_at TEXT NOT NULL,
        trained_at TEXT,
        archived_at TEXT,
        archived_by TEXT
    );

    CREATE TABLE model_deployments (
        id TEXT PRIMARY KEY,
        number INTEGER NOT NULL UNIQUE,
        model_id TEXT REFERENCES models(id),
        environment TEXT NOT NULL,
        action TEXT NOT NULL,
        status TEXT NOT NULL,
        deployed_by TEXT NOT NULL,
        deployed_at TEXT NOT NULL,
        ended_at TEXT,
        previous_deployment_id TEXT REFERENCES model_deployments(id),
        permission_override INTEGER NOT NULL DEFAULT 0,
        override_by TEXT,
        override_at TEXT,
        override_reason TEXT,
        note TEXT
    );

    CREATE TABLE prediction_logs (
        id TEXT PRIMARY KEY,
        model_id TEXT REFERENCES models(id),
        deployment_id TEXT,
        source TEXT NOT NULL,
        predicted_class TEXT,
        confidence REAL,
        uncertain INTEGER,
        threshold REAL,
        inference_ms REAL,
        created_at TEXT NOT NULL,
        feedback TEXT,
        feedback_at TEXT
    );

    CREATE TABLE audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        at TEXT NOT NULL,
        actor TEXT NOT NULL,
        action TEXT NOT NULL,
        target_type TEXT,
        target_id TEXT,
        details_json TEXT
    );

    CREATE TABLE settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_by TEXT,
        updated_at TEXT NOT NULL
    );

    CREATE TABLE worker_heartbeat (
        worker_id TEXT PRIMARY KEY,
        pid INTEGER,
        host TEXT,
        device TEXT,
        device_name TEXT,
        started_at TEXT NOT NULL,
        last_seen TEXT NOT NULL,
        current_task TEXT
    );

    CREATE INDEX ix_dsv_status ON dataset_versions(status);
    CREATE INDEX ix_jobs_status ON training_jobs(status);
    CREATE INDEX ix_deploy_env_status ON model_deployments(environment, status);
    CREATE INDEX ix_pred_created ON prediction_logs(created_at);
    """,
]


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:16]}"


_init_lock = threading.Lock()
_initialised: set[str] = set()


def _open() -> sqlite3.Connection:
    path = get_settings().db_path
    conn = sqlite3.connect(path, timeout=30, isolation_level=None, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA busy_timeout = 30000")
    return conn


def init_db() -> None:
    key = str(get_settings().db_path)
    with _init_lock:
        if key in _initialised:
            return
        conn = _open()
        try:
            conn.execute("PRAGMA journal_mode = WAL")
            conn.execute("CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL)")
            row = conn.execute("SELECT MAX(version) AS v FROM schema_version").fetchone()
            current = row["v"] or 0
            for i, sql in enumerate(MIGRATIONS, start=1):
                if i <= current:
                    continue
                conn.execute("BEGIN")
                for stmt in _split_sql(sql):
                    conn.execute(stmt)
                conn.execute("INSERT INTO schema_version (version) VALUES (?)", (i,))
                conn.execute("COMMIT")
        finally:
            conn.close()
        _initialised.add(key)


def _split_sql(script: str) -> list[str]:
    return [s.strip() for s in script.split(";") if s.strip()]


def reset_db_cache() -> None:
    _initialised.clear()


@contextmanager
def connect() -> Iterator[sqlite3.Connection]:
    """Autocommit connection. Use `with transaction(conn):` for multi-statement atomic writes."""
    init_db()
    conn = _open()
    try:
        yield conn
    finally:
        conn.close()


@contextmanager
def transaction(conn: sqlite3.Connection) -> Iterator[sqlite3.Connection]:
    conn.execute("BEGIN IMMEDIATE")
    try:
        yield conn
        conn.execute("COMMIT")
    except BaseException:
        conn.execute("ROLLBACK")
        raise


def row_dict(row: sqlite3.Row | None) -> dict[str, Any] | None:
    return dict(row) if row is not None else None


def loads(value: str | None, default: Any = None) -> Any:
    if value is None or value == "":
        return default
    try:
        return json.loads(value)
    except (TypeError, ValueError):
        return default


def dumps(value: Any) -> str:
    return json.dumps(value, separators=(",", ":"), ensure_ascii=False)


def next_number(conn: sqlite3.Connection, table: str) -> int:
    assert table in {"training_jobs", "model_deployments"}
    row = conn.execute(f"SELECT COALESCE(MAX(number), 0) + 1 AS n FROM {table}").fetchone()
    return int(row["n"])
