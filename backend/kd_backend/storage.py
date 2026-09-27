"""
Storage layout (local disk for the MVP):

    <ML_STORAGE_PATH>/
        temp/<dataset_version_id>.zip.part     uploads in progress (cleaned when stale)
        datasets/<dataset_version_id>/          extracted, validated images + manifest (immutable)
        checkpoints/<training_job_id>/          best checkpoint while training
        models/<model_id>/                      final artefact bundle (weights + manifest + metrics)
        evaluations/<model_id>/                 test-set predictions used for the metrics
        weights/                                torchvision pretrained-weight cache

The database stores paths *relative* to the storage root, so the folder can move (or be swapped for
object storage behind this module) without rewriting records. Every path is resolved and checked to
stay inside its root — nothing outside can be read or written through these helpers.
"""
from __future__ import annotations

import hashlib
import shutil
from pathlib import Path

from .config import get_settings


class StorageError(Exception):
    pass


def _inside(root: Path, p: Path) -> Path:
    p = p.resolve()
    root = root.resolve()
    if p != root and root not in p.parents:
        raise StorageError("Path escapes the storage root")
    return p


def root() -> Path:
    return get_settings().storage_root


def rel(p: Path) -> str:
    return _inside(root(), p).relative_to(root().resolve()).as_posix()


def resolve(relative: str) -> Path:
    if not relative or relative.startswith(("/", "\\")) or ":" in relative:
        raise StorageError("Invalid stored path")
    return _inside(root(), root() / relative)


def dataset_dir(dsv_id: str) -> Path:
    return _inside(get_settings().datasets_dir, get_settings().datasets_dir / dsv_id)


def upload_part(dsv_id: str) -> Path:
    return _inside(get_settings().temp_dir, get_settings().temp_dir / f"{dsv_id}.zip.part")


def checkpoint_dir(job_id: str) -> Path:
    return _inside(get_settings().checkpoints_dir, get_settings().checkpoints_dir / job_id)


def model_dir(model_id: str) -> Path:
    return _inside(get_settings().models_dir, get_settings().models_dir / model_id)


def evaluation_dir(model_id: str) -> Path:
    return _inside(get_settings().evaluations_dir, get_settings().evaluations_dir / model_id)


def remove_tree(p: Path) -> None:
    p = _inside(root(), p)
    if p.exists():
        shutil.rmtree(p, ignore_errors=True)


def sha256_file(p: Path, chunk: int = 1024 * 1024) -> str:
    h = hashlib.sha256()
    with open(p, "rb") as f:
        while True:
            b = f.read(chunk)
            if not b:
                break
            h.update(b)
    return h.hexdigest()
