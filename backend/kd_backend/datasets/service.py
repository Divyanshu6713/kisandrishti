"""
Dataset registry: provenance records, upload lifecycle, ingestion/validation (run by the worker),
splits, and immutability.

Status lifecycle of a dataset version:
    awaiting_upload → uploading → queued → validating → ready | ready_with_warnings | invalid
                                   ↘ upload_failed                    ↘ failed (unexpected error)

Immutability: images are written once during ingestion and never modified. Adding or changing images
means uploading a new dataset version. A version becomes *locked* when a training job first uses it;
locked versions cannot be deleted (models keep pointing at them). Split records are append-only: a new
split never changes one that a model was trained on.
"""
from __future__ import annotations

import json
import logging
import re
from collections import Counter
from pathlib import Path
from typing import Any, Callable

from .. import audit, storage
from ..config import get_settings
from ..db import PERMISSION_STATUSES, connect, dumps, loads, new_id, now, transaction
from ..errors import AppError, bad_request, conflict, not_found, redact_paths
from ..naming import display_name
from . import ingest as ing
from . import split as sp
from . import validate as val

log = logging.getLogger("kd.datasets")

PROVENANCE_FIELDS = ("description", "source", "owner", "license", "permission_status", "collection_method", "notes")
VERSION_RE = re.compile(r"^[0-9A-Za-z][0-9A-Za-z._-]{0,31}$")
PROCESSING = ("queued", "validating")
USABLE = ("ready", "ready_with_warnings")


def _clean(v: Any, limit: int = 2000) -> str | None:
    if v is None:
        return None
    s = str(v).strip()
    return s[:limit] if s else None


def _public(row: dict) -> dict:
    """Dataset version as returned by the API — never includes absolute paths."""
    d = dict(row)
    d["validation"] = loads(d.pop("validation_json", None))
    d.pop("storage_path", None)
    return d


# ---------------------------------------------------------------- create / upload


def create_version(meta: dict, actor: str) -> dict:
    perm = meta.get("permission_status")
    if perm not in PERMISSION_STATUSES:
        raise bad_request("invalid_permission_status", "Choose a permission status for this dataset.")
    version = _clean(meta.get("version"), 32)
    if not version or not VERSION_RE.match(version):
        raise bad_request("invalid_version", "Version must be 1–32 characters: letters, digits, '.', '_' or '-' (e.g. 1.0).")
    for f in ("source", "owner", "license"):
        if not _clean(meta.get(f)):
            raise bad_request("missing_provenance", f"Provenance field “{f}” is required. Enter “Unknown” if it is not known.")
    if meta.get("confirm_provenance") is not True:
        raise bad_request("provenance_not_confirmed", "Confirm that the provenance and permission information is accurate.")
    filename = _clean(meta.get("original_filename"), 255) or "dataset.zip"
    if not filename.lower().endswith(".zip"):
        raise bad_request("unsupported_archive", "Only .zip archives are accepted.")
    size = meta.get("size_bytes")
    if not isinstance(size, int) or size <= 0:
        raise bad_request("invalid_size", "The archive size is missing.")
    if size > get_settings().max_upload_bytes:
        raise AppError(413, "too_large", f"The archive is larger than the {get_settings().max_upload_bytes / 1024**3:.1f} GB upload limit.")

    t = now()
    with connect() as c, transaction(c):
        if meta.get("dataset_id"):
            ds = c.execute("SELECT * FROM datasets WHERE id = ?", (meta["dataset_id"],)).fetchone()
            if not ds:
                raise not_found("Dataset")
            dataset_id = ds["id"]
        else:
            name = _clean(meta.get("dataset_name"), 120)
            if not name:
                raise bad_request("missing_name", "Enter a dataset name.")
            if c.execute("SELECT 1 FROM datasets WHERE lower(name) = lower(?)", (name,)).fetchone():
                raise conflict("dataset_exists", f"A dataset named “{name}” already exists. Add a new version to it instead.")
            dataset_id = new_id("ds")
            c.execute(
                "INSERT INTO datasets (id, name, description, created_by, created_at) VALUES (?, ?, ?, ?, ?)",
                (dataset_id, name, _clean(meta.get("dataset_description")), actor, t),
            )
        if c.execute("SELECT 1 FROM dataset_versions WHERE dataset_id = ? AND version = ?", (dataset_id, version)).fetchone():
            raise conflict("version_exists", f"Version {version} already exists for this dataset. Use a new version number.")
        dsv_id = new_id("dsv")
        c.execute(
            """INSERT INTO dataset_versions (id, dataset_id, version, description, source, owner, license, permission_status,
                   collection_method, notes, original_filename, upload_bytes, status, uploaded_by, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'awaiting_upload', ?, ?, ?)""",
            (
                dsv_id, dataset_id, version, _clean(meta.get("description")), _clean(meta.get("source"), 500), _clean(meta.get("owner"), 200),
                _clean(meta.get("license"), 500), perm, _clean(meta.get("collection_method"), 500), _clean(meta.get("notes")), filename, size, actor, t, t,
            ),
        )
        audit.record(actor, "dataset.version_created", "dataset_version", dsv_id, conn=c, version=version, dataset_id=dataset_id, permission_status=perm, filename=filename)
    return get_version(dsv_id)


def mark_upload(dsv_id: str, status: str, *, received: int | None = None, sha: str | None = None, detail: str | None = None) -> None:
    with connect() as c:
        c.execute(
            "UPDATE dataset_versions SET status = ?, received_bytes = COALESCE(?, received_bytes), archive_sha256 = COALESCE(?, archive_sha256), status_detail = ?, updated_at = ? WHERE id = ?",
            (status, received, sha, detail, now(), dsv_id),
        )


def begin_upload(dsv_id: str) -> dict:
    with connect() as c, transaction(c):
        row = c.execute("SELECT * FROM dataset_versions WHERE id = ?", (dsv_id,)).fetchone()
        if not row:
            raise not_found("Dataset version")
        if row["status"] not in ("awaiting_upload", "upload_failed", "invalid", "failed"):
            raise conflict("upload_not_allowed", "This dataset version already has an uploaded archive. Create a new version to upload different data.")
        c.execute("UPDATE dataset_versions SET status = 'uploading', received_bytes = 0, status_detail = NULL, updated_at = ? WHERE id = ?", (now(), dsv_id))
    return dict(row)


# ---------------------------------------------------------------- read / update / delete


def list_datasets() -> list[dict]:
    with connect() as c:
        ds = [dict(r) for r in c.execute("SELECT * FROM datasets ORDER BY created_at DESC")]
        vs = [dict(r) for r in c.execute("SELECT * FROM dataset_versions ORDER BY created_at DESC")]
        used = {r["dataset_version_id"]: r["n"] for r in c.execute("SELECT dataset_version_id, COUNT(*) AS n FROM models GROUP BY dataset_version_id")}
    for d in ds:
        d["versions"] = []
    by_id = {d["id"]: d for d in ds}
    for v in vs:
        pv = _public(v)
        pv["warning_count"] = sum(1 for w in (pv.get("validation") or {}).get("warnings", []) if w["severity"] != "info")
        pv["model_count"] = used.get(v["id"], 0)
        pv.pop("validation", None)
        by_id[v["dataset_id"]]["versions"].append(pv)
    return ds


def get_version(dsv_id: str) -> dict:
    with connect() as c:
        row = c.execute(
            "SELECT v.*, d.name AS dataset_name FROM dataset_versions v JOIN datasets d ON d.id = v.dataset_id WHERE v.id = ?", (dsv_id,)
        ).fetchone()
        if not row:
            raise not_found("Dataset version")
        classes = [dict(r) for r in c.execute("SELECT class_index, raw_name, display_name, image_count FROM dataset_classes WHERE dataset_version_id = ? ORDER BY class_index", (dsv_id,))]
        splits = [_split_public(dict(r)) for r in c.execute("SELECT * FROM dataset_splits WHERE dataset_version_id = ? ORDER BY created_at DESC", (dsv_id,))]
        models = [dict(r) for r in c.execute("SELECT id, version, status, split_id FROM models WHERE dataset_version_id = ? ORDER BY created_at DESC", (dsv_id,))]
    out = _public(dict(row))
    out["classes"] = classes
    out["splits"] = splits
    out["models"] = models
    return out


def _split_public(r: dict) -> dict:
    r["per_class"] = loads(r.pop("per_class_json"), {})
    r["warnings"] = loads(r.pop("warnings_json"), [])
    r.pop("manifest_path", None)
    return r


def update_provenance(dsv_id: str, changes: dict, actor: str) -> dict:
    fields = {k: changes[k] for k in PROVENANCE_FIELDS if k in changes}
    if not fields:
        raise bad_request("nothing_to_update", "No provenance fields were provided.")
    if "permission_status" in fields and fields["permission_status"] not in PERMISSION_STATUSES:
        raise bad_request("invalid_permission_status", "Unknown permission status.")
    if changes.get("confirm_provenance") is not True:
        raise bad_request("provenance_not_confirmed", "Confirm that the updated provenance information is accurate.")
    with connect() as c, transaction(c):
        row = c.execute("SELECT * FROM dataset_versions WHERE id = ?", (dsv_id,)).fetchone()
        if not row:
            raise not_found("Dataset version")
        before = {k: row[k] for k in fields}
        clean = {k: (_clean(v) if k != "permission_status" else v) for k, v in fields.items()}
        for k in ("source", "owner", "license"):
            if k in clean and not clean[k]:
                raise bad_request("missing_provenance", f"“{k}” cannot be empty. Enter “Unknown” if it is not known.")
        sets = ", ".join(f"{k} = ?" for k in clean)
        c.execute(f"UPDATE dataset_versions SET {sets}, updated_at = ? WHERE id = ?", (*clean.values(), now(), dsv_id))
        audit.record(actor, "dataset.provenance_updated", "dataset_version", dsv_id, conn=c, before=before, after=clean)
    return get_version(dsv_id)


def delete_version(dsv_id: str, actor: str) -> None:
    with connect() as c, transaction(c):
        row = c.execute("SELECT * FROM dataset_versions WHERE id = ?", (dsv_id,)).fetchone()
        if not row:
            raise not_found("Dataset version")
        if row["status"] in ("uploading", "validating"):
            raise conflict("dataset_busy", "This dataset version is still being uploaded or validated.")
        if c.execute("SELECT 1 FROM training_jobs WHERE dataset_version_id = ?", (dsv_id,)).fetchone():
            raise conflict("dataset_in_use", "This dataset version was used for training. It is kept so every model can be traced back to its data.")
        c.execute("DELETE FROM dataset_splits WHERE dataset_version_id = ?", (dsv_id,))
        c.execute("DELETE FROM dataset_versions WHERE id = ?", (dsv_id,))
        remaining = c.execute("SELECT COUNT(*) AS n FROM dataset_versions WHERE dataset_id = ?", (row["dataset_id"],)).fetchone()["n"]
        if remaining == 0:
            c.execute("DELETE FROM datasets WHERE id = ?", (row["dataset_id"],))
        audit.record(actor, "dataset.version_deleted", "dataset_version", dsv_id, conn=c, version=row["version"], dataset_id=row["dataset_id"])
    storage.remove_tree(storage.dataset_dir(dsv_id))
    storage.upload_part(dsv_id).unlink(missing_ok=True)


# ---------------------------------------------------------------- ingestion (worker)


def _set_progress(dsv_id: str, detail: str, progress: float) -> None:
    with connect() as c:
        c.execute("UPDATE dataset_versions SET status_detail = ?, progress = ?, updated_at = ? WHERE id = ?", (detail, round(progress, 4), now(), dsv_id))


def claim_next_ingest() -> str | None:
    with connect() as c, transaction(c):
        row = c.execute("SELECT id FROM dataset_versions WHERE status = 'queued' ORDER BY updated_at LIMIT 1").fetchone()
        if not row:
            return None
        c.execute("UPDATE dataset_versions SET status = 'validating', status_detail = 'Checking archive', progress = 0, updated_at = ? WHERE id = ?", (now(), row["id"]))
        return row["id"]


def ingest(dsv_id: str, should_stop: Callable[[], bool] | None = None) -> None:
    """Extract + validate an uploaded archive. Always ends in ready / ready_with_warnings / invalid / failed."""
    s = get_settings()
    part = storage.upload_part(dsv_id)
    dest = storage.dataset_dir(dsv_id)
    try:
        if not part.is_file():
            raise ing.IngestError("archive_missing", "The uploaded archive is missing. Upload it again.")
        storage.remove_tree(dest)
        dest.mkdir(parents=True)
        plan = ing.inspect_archive(part, max_members=s.max_archive_members, max_uncompressed=s.max_uncompressed_bytes, max_ratio=s.max_compression_ratio)
        classes_seen = sorted({c.raw_class for c in plan.candidates})
        storage_index = {name: i for i, name in enumerate(classes_seen)}

        _set_progress(dsv_id, f"Extracting {len(plan.candidates):,} image files", 0.02)
        extracted, failed = ing.extract(
            part, plan, dest, storage_index, max_uncompressed=s.max_uncompressed_bytes,
            on_progress=lambda i, n: _set_progress(dsv_id, f"Extracting images {i:,}/{n:,}", 0.02 + 0.38 * i / max(1, n)),
            should_stop=should_stop,
        )
        rejected = [{"file": name, "reason": reason} for name, reason in failed]

        _set_progress(dsv_id, f"Decoding and checking {len(extracted):,} images", 0.4)
        checks = val.check_many(
            [x.path for x in extracted], s.max_image_pixels,
            on_progress=lambda i, n: _set_progress(dsv_id, f"Checking images {i:,}/{n:,}", 0.4 + 0.45 * i / max(1, n)),
        )
        entries: list[dict] = []
        for x, chk in zip(extracted, checks):
            if not chk.ok:
                rejected.append({"file": x.candidate.original_name, "reason": chk.reason or "corrupt_or_unreadable"})
                x.path.unlink(missing_ok=True)
                continue
            real_ext = val.ALLOWED_FORMATS[chk.format or "JPEG"]
            path = x.path
            mismatch = real_ext != x.candidate.ext
            if mismatch:
                path = x.path.with_suffix(real_ext)
                x.path.rename(path)
            entries.append({
                "path": path.relative_to(dest).as_posix(),
                "class": x.candidate.raw_class,
                "split": x.candidate.split,
                "sha256": x.sha256,
                "dhash": chk.dhash,
                "w": chk.width,
                "h": chk.height,
                "format": "JPEG" if chk.format == "MPO" else chk.format,
                "mode": chk.mode,
                "bytes": x.bytes,
                "original": x.candidate.original_name,
                **({"nested": True} if x.candidate.nested else {}),
                **({"ext_mismatch": True} if mismatch else {}),
            })

        _set_progress(dsv_id, "Looking for duplicate images", 0.88)
        groups, dup_stats = val.duplicate_groups(entries)
        for e, g in zip(entries, groups):
            e["group"] = g
        report = val.build_report(
            structure=plan.structure, entries=entries, rejected=rejected, skipped_counts=plan.skipped_counts,
            skipped_samples=plan.skipped, class_dirs=plan.class_dirs, dup_stats=dup_stats, min_per_class=s.min_images_per_class_warning,
        )
        report["stripped_prefix"] = plan.stripped_prefix
        chash = val.content_hash(entries)
        manifest = {"dataset_version_id": dsv_id, "content_hash": chash, "structure": plan.structure, "created_at": now(),
                    "entries": [{**e, "dhash": f"{e['dhash']:016x}"} for e in entries]}
        (dest / "manifest.json").write_text(json.dumps(manifest, separators=(",", ":")), encoding="utf-8")
        (dest / "validation.json").write_text(json.dumps(report, indent=1), encoding="utf-8")

        classes = [c["raw_name"] for c in report["classes"]]
        with connect() as c, transaction(c):
            c.execute("DELETE FROM dataset_classes WHERE dataset_version_id = ?", (dsv_id,))
            for i, cls in enumerate(classes):
                c.execute(
                    "INSERT INTO dataset_classes (dataset_version_id, class_index, raw_name, display_name, image_count) VALUES (?, ?, ?, ?, ?)",
                    (dsv_id, i, cls, display_name(cls), report["classes"][i]["count"]),
                )
            c.execute(
                """UPDATE dataset_versions SET status = ?, status_detail = NULL, progress = 1, structure = ?, storage_path = ?, total_images = ?,
                       class_count = ?, total_bytes = ?, content_hash = ?, validation_json = ?, updated_at = ? WHERE id = ?""",
                (report["status"], plan.structure, storage.rel(dest), len(entries), len(classes), report["summary"]["total_bytes"], chash, dumps(report), now(), dsv_id),
            )
            audit.record("system", "dataset.validated", "dataset_version", dsv_id, conn=c, status=report["status"], images=len(entries), classes=len(classes))

        # Folder-defined splits are registered as-is when all three partitions exist.
        if report["status"] in USABLE and plan.structure == "predefined_splits":
            counts = Counter(e["split"] for e in entries)
            if all(counts.get(k, 0) > 0 for k in sp.SPLITS):
                _save_split(dsv_id, "predefined", entries, [e["split"] for e in entries], None, None, None, None, [], "system")
    except ing.IngestError as e:
        _fail(dsv_id, "invalid", e.message, {"code": e.code})
        storage.remove_tree(dest)
    except Exception as e:  # unexpected: keep details in the server log only
        log.exception("Dataset ingestion failed for %s", dsv_id)
        _fail(dsv_id, "failed", f"Validation stopped because of an unexpected error ({type(e).__name__}: {redact_paths(e, 200)}).", {"code": "internal_error"})
        storage.remove_tree(dest)
    finally:
        if not s.keep_upload_archives:
            part.unlink(missing_ok=True)


def _fail(dsv_id: str, status: str, message: str, extra: dict) -> None:
    report = {"status": status, "error": {"message": message, **extra}, "warnings": [{"code": extra.get("code", "error"), "severity": "error", "message": message}]}
    with connect() as c:
        c.execute(
            "UPDATE dataset_versions SET status = ?, status_detail = ?, progress = NULL, validation_json = ?, updated_at = ? WHERE id = ?",
            (status, message, dumps(report), now(), dsv_id),
        )
    audit.record("system", "dataset.validation_failed", "dataset_version", dsv_id, status=status, reason=message)


# ---------------------------------------------------------------- manifest + splits


def load_manifest(dsv_id: str) -> dict:
    with connect() as c:
        row = c.execute("SELECT storage_path, status FROM dataset_versions WHERE id = ?", (dsv_id,)).fetchone()
    if not row or not row["storage_path"]:
        raise not_found("Dataset files")
    p = storage.resolve(row["storage_path"]) / "manifest.json"
    if not p.is_file():
        raise AppError(409, "manifest_missing", "The dataset's manifest file is missing on disk.")
    m = json.loads(p.read_text(encoding="utf-8"))
    for e in m["entries"]:
        e["dhash"] = int(e["dhash"], 16)
    m["root"] = storage.resolve(row["storage_path"])
    return m


def _save_split(dsv_id: str, strategy: str, entries: list[dict], assign: list[str], train: float | None, val_: float | None, test: float | None,
                seed: int | None, warnings: list[dict], actor: str) -> dict:
    split_id = new_id("split")
    counts, per_class = sp.summarise(entries, assign)
    root = storage.dataset_dir(dsv_id) / "splits"
    root.mkdir(parents=True, exist_ok=True)
    path = root / f"{split_id}.json"
    body = {"split_id": split_id, "dataset_version_id": dsv_id, "strategy": strategy, "seed": seed,
            "percentages": {"train": train, "val": val_, "test": test}, "created_at": now(), "assign": assign}
    path.write_text(json.dumps(body, separators=(",", ":")), encoding="utf-8")
    sha = storage.sha256_file(path)
    with connect() as c, transaction(c):
        c.execute(
            """INSERT INTO dataset_splits (id, dataset_version_id, strategy, train_pct, val_pct, test_pct, seed, train_count, val_count, test_count,
                   per_class_json, warnings_json, manifest_path, manifest_sha256, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (split_id, dsv_id, strategy, train, val_, test, seed, counts["train"], counts["val"], counts["test"], dumps(per_class), dumps(warnings),
             storage.rel(path), sha, actor, now()),
        )
        audit.record(actor, "dataset.split_created", "dataset_split", split_id, conn=c, dataset_version_id=dsv_id, strategy=strategy, seed=seed,
                     percentages=[train, val_, test], counts=counts)
    return {"id": split_id, **counts}


def create_split(dsv_id: str, train: float, val_: float, test: float, seed: int, actor: str) -> dict:
    with connect() as c:
        row = c.execute("SELECT status FROM dataset_versions WHERE id = ?", (dsv_id,)).fetchone()
    if not row:
        raise not_found("Dataset version")
    if row["status"] not in USABLE:
        raise conflict("dataset_not_ready", "Only a validated dataset (Ready or Ready with warnings) can be split.")
    if not isinstance(seed, int) or not (0 <= seed <= 2**31 - 1):
        raise bad_request("invalid_seed", "Seed must be a whole number between 0 and 2147483647.")
    try:
        sp.validate_percentages(train, val_, test)
    except ValueError as e:
        raise bad_request("invalid_percentages", str(e))
    m = load_manifest(dsv_id)
    entries = m["entries"]
    groups = [e["group"] for e in entries]
    assign, warnings = sp.stratified_group_split(entries, groups, train, val_, test, seed)
    out = _save_split(dsv_id, "stratified_random", entries, assign, train, val_, test, seed, warnings, actor)
    return get_split(out["id"])


def get_split(split_id: str) -> dict:
    with connect() as c:
        row = c.execute("SELECT * FROM dataset_splits WHERE id = ?", (split_id,)).fetchone()
    if not row:
        raise not_found("Split")
    return _split_public(dict(row))


def load_split_assignments(split_id: str) -> tuple[dict, list[str]]:
    with connect() as c:
        row = c.execute("SELECT * FROM dataset_splits WHERE id = ?", (split_id,)).fetchone()
    if not row:
        raise not_found("Split")
    p = storage.resolve(row["manifest_path"])
    if storage.sha256_file(p) != row["manifest_sha256"]:
        raise AppError(409, "split_modified", "The split manifest on disk does not match its recorded checksum.")
    return dict(row), json.loads(p.read_text(encoding="utf-8"))["assign"]


def cleanup_stale_uploads() -> int:
    """Uploads interrupted for longer than STALE_UPLOAD_HOURS are marked failed and their temp files removed."""
    s = get_settings()
    from datetime import datetime, timedelta, timezone

    cutoff = (datetime.now(timezone.utc) - timedelta(hours=s.stale_upload_hours)).isoformat(timespec="seconds").replace("+00:00", "Z")
    n = 0
    with connect() as c:
        rows = c.execute("SELECT id FROM dataset_versions WHERE status IN ('awaiting_upload', 'uploading') AND updated_at < ?", (cutoff,)).fetchall()
        for r in rows:
            c.execute("UPDATE dataset_versions SET status = 'upload_failed', status_detail = 'Upload did not finish and was cleaned up.', updated_at = ? WHERE id = ?", (now(), r["id"]))
            storage.upload_part(r["id"]).unlink(missing_ok=True)
            n += 1
    # Orphaned .part files with no matching record
    with connect() as c:
        known = {r["id"] for r in c.execute("SELECT id FROM dataset_versions")}
    for f in Path(s.temp_dir).glob("*.zip.part"):
        if f.name.removesuffix(".zip.part") not in known:
            f.unlink(missing_ok=True)
            n += 1
    return n


def recover_interrupted() -> None:
    """Called when a worker starts: anything left 'validating' by a crashed worker is marked failed."""
    with connect() as c:
        rows = c.execute("SELECT id FROM dataset_versions WHERE status = 'validating'").fetchall()
    for r in rows:
        _fail(r["id"], "failed", "Validation was interrupted (the worker stopped). Upload the archive again as a new version.", {"code": "interrupted"})
