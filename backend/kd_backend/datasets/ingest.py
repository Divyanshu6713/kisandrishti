"""
Safe ZIP ingestion. The archive is treated as hostile input:

* Archive-level rejection (nothing is extracted): not a ZIP / corrupt central directory, too many
  members, absolute paths, drive letters, "..", NUL bytes, symlinks, declared uncompressed size over
  the limit, or a suspicious compression ratio (zip bomb).
* Member-level skipping (reported, never extracted): hidden/system files (__MACOSX, .DS_Store,
  Thumbs.db…), executables/scripts, non-image extensions, encrypted members, files outside a class folder.
* Extraction never uses names from the archive: each image is written to
  images/<split>/<class index>/<counter><ext>, so traversal and duplicate names are impossible.
  Bytes are streamed with a hard cap (a member cannot write more than its declared size), and a
  SHA-256 of the content is computed while copying.

Images are then decoded by `validate.check_image`; anything that does not decode is deleted.
"""
from __future__ import annotations

import hashlib
import re
import stat
import zipfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}
EXECUTABLE_EXTENSIONS = {
    ".exe", ".dll", ".so", ".dylib", ".bat", ".cmd", ".com", ".msi", ".scr", ".ps1", ".psm1", ".vbs", ".js", ".mjs",
    ".jar", ".sh", ".bash", ".py", ".pyc", ".pl", ".rb", ".php", ".app", ".apk", ".lnk", ".hta", ".wsf", ".elf", ".bin",
}
SYSTEM_NAMES = {"__macosx", ".ds_store", "thumbs.db", "desktop.ini", ".git", ".svn", "__pycache__", ".ipynb_checkpoints", "$recycle.bin"}
SPLIT_ALIASES = {"train": "train", "training": "train", "val": "val", "valid": "val", "validation": "val", "test": "test", "testing": "test"}
MAX_CLASS_NAME = 120
MAX_MEMBER_BYTES = 200 * 1024 * 1024  # no single leaf photo is this large
_DRIVE = re.compile(r"^[A-Za-z]:")
_CTRL = re.compile(r"[\x00-\x1f\x7f]")


class IngestError(Exception):
    """Archive-level failure; the whole upload is rejected."""

    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


@dataclass
class Candidate:
    info: zipfile.ZipInfo
    split: str | None  # declared split for predefined structure
    raw_class: str
    original_name: str
    ext: str
    nested: bool


@dataclass
class ArchivePlan:
    structure: str  # "predefined_splits" | "class_folders"
    candidates: list[Candidate]
    class_dirs: dict[str | None, set[str]]  # split → class folder names seen (including empty ones)
    skipped: dict[str, list[str]] = field(default_factory=dict)  # reason → sample names
    skipped_counts: dict[str, int] = field(default_factory=dict)
    declared_bytes: int = 0
    stripped_prefix: str = ""


def _skip(plan_skipped: dict, counts: dict, reason: str, name: str) -> None:
    counts[reason] = counts.get(reason, 0) + 1
    lst = plan_skipped.setdefault(reason, [])
    if len(lst) < 25:
        lst.append(_display_path(name))


def _display_path(name: str) -> str:
    return _CTRL.sub("?", name)[:200]


def _is_symlink(info: zipfile.ZipInfo) -> bool:
    mode = info.external_attr >> 16
    return info.create_system == 3 and stat.S_ISLNK(mode)


def _parts(name: str) -> list[str]:
    return [p for p in name.replace("\\", "/").split("/") if p not in ("", ".")]


def inspect_archive(zip_path: Path, *, max_members: int, max_uncompressed: int, max_ratio: float) -> ArchivePlan:
    try:
        zf = zipfile.ZipFile(zip_path)
    except (zipfile.BadZipFile, OSError, ValueError):
        raise IngestError("corrupt_archive", "The file is not a valid ZIP archive, or it is damaged.")
    with zf:
        try:
            infos = zf.infolist()
        except Exception:
            raise IngestError("corrupt_archive", "The ZIP archive's file list could not be read.")
        if len(infos) > max_members:
            raise IngestError("too_many_files", f"The archive has {len(infos):,} entries; the limit is {max_members:,}.")

        total = 0
        entries: list[tuple[zipfile.ZipInfo, list[str], bool]] = []
        skipped: dict[str, list[str]] = {}
        counts: dict[str, int] = {}
        for info in infos:
            raw = info.filename
            name = raw.replace("\\", "/")
            if "\x00" in name or name.startswith("/") or _DRIVE.match(name) or any(p == ".." for p in name.split("/")):
                raise IngestError("unsafe_archive", "The archive contains unsafe file paths (absolute paths or '..'). It was rejected without extracting anything.")
            if _is_symlink(info):
                raise IngestError("unsafe_archive", "The archive contains symbolic links. It was rejected without extracting anything.")
            parts = _parts(name)
            if not parts:
                continue
            if any(p.lower() in SYSTEM_NAMES or p.startswith(".") for p in parts):
                _skip(skipped, counts, "hidden_or_system", raw)
                continue
            is_dir = info.is_dir()
            if not is_dir:
                total += info.file_size
                if total > max_uncompressed:
                    raise IngestError("too_large_uncompressed", f"The archive expands to more than {max_uncompressed / 1024**3:.1f} GB, which is over the limit.")
                if info.file_size > 1024 * 1024 and info.file_size / max(info.compress_size, 1) > max_ratio:
                    raise IngestError("suspicious_compression", "The archive has a suspicious compression ratio (possible ZIP bomb). It was rejected.")
            entries.append((info, parts, is_dir))

        # Strip wrapper folders such as "dataset/" or "PlantVillage/" that contain everything.
        stripped: list[str] = []
        for _ in range(3):
            files = [p for _, p, d in entries if not d]
            if not files:
                break
            first = {p[0] for _, p, _d in entries}
            # A README or similar at the wrapper's root must not stop the stripping.
            if len(first) == 1 and any(len(p) >= 3 for p in files) and next(iter(first)).lower() not in SPLIT_ALIASES:
                stripped.append(next(iter(first)))
                entries = [(i, p[1:], d) for i, p, d in entries if len(p) > 1]
            else:
                break

        top_dirs = {p[0] for _, p, d in entries if d or len(p) > 1}
        split_dirs = {d for d in top_dirs if d.lower() in SPLIT_ALIASES}
        if split_dirs and split_dirs != top_dirs:
            others = sorted(top_dirs - split_dirs)[:5]
            raise IngestError(
                "malformed_structure",
                "The archive mixes split folders (train/validation/test) with other top-level folders: " + ", ".join(others) + ". Use either split folders or class folders at the top level.",
            )
        structure = "predefined_splits" if split_dirs else "class_folders"

        class_dirs: dict[str | None, set[str]] = {}
        candidates: list[Candidate] = []
        for info, parts, is_dir in entries:
            if structure == "predefined_splits":
                if parts[0].lower() not in SPLIT_ALIASES:
                    # A loose file next to train/ val/ test/ (e.g. a training script or README) — never a class.
                    if not is_dir:
                        ext = Path(parts[-1]).suffix.lower()
                        _skip(skipped, counts, "executable_or_script" if ext in EXECUTABLE_EXTENSIONS else "outside_class_folder", info.filename)
                    continue
                split = SPLIT_ALIASES[parts[0].lower()]
                cls_parts = parts[1:]
            else:
                split = None
                cls_parts = parts
            if is_dir:
                if len(cls_parts) >= 1:
                    class_dirs.setdefault(split, set()).add(cls_parts[0])
                continue
            if len(cls_parts) < 2:
                _skip(skipped, counts, "outside_class_folder", info.filename)
                continue
            cls = cls_parts[0]
            if len(cls) > MAX_CLASS_NAME or _CTRL.search(cls):
                _skip(skipped, counts, "invalid_class_name", info.filename)
                continue
            class_dirs.setdefault(split, set()).add(cls)
            ext = Path(cls_parts[-1]).suffix.lower()
            if ext in EXECUTABLE_EXTENSIONS:
                _skip(skipped, counts, "executable_or_script", info.filename)
                continue
            if ext not in IMAGE_EXTENSIONS:
                _skip(skipped, counts, "not_an_image", info.filename)
                continue
            if info.flag_bits & 0x1:
                _skip(skipped, counts, "encrypted", info.filename)
                continue
            candidates.append(Candidate(info=info, split=split, raw_class=cls, original_name=_display_path("/".join(parts)), ext=".jpg" if ext == ".jpeg" else ext, nested=len(cls_parts) > 2))

        return ArchivePlan(
            structure=structure,
            candidates=candidates,
            class_dirs=class_dirs,
            skipped=skipped,
            skipped_counts=counts,
            declared_bytes=total,
            stripped_prefix="/".join(stripped),
        )


@dataclass
class Extracted:
    path: Path
    candidate: Candidate
    sha256: str
    bytes: int


def extract(
    zip_path: Path,
    plan: ArchivePlan,
    dest: Path,
    class_index: dict[str, int],
    *,
    max_uncompressed: int,
    on_progress: Callable[[int, int], None] | None = None,
    should_stop: Callable[[], bool] | None = None,
) -> tuple[list[Extracted], list[tuple[str, str]]]:
    """Returns (extracted files, [(original name, reason)] for members that failed to extract)."""
    out: list[Extracted] = []
    failed: list[tuple[str, str]] = []
    written = 0
    n = len(plan.candidates)
    with zipfile.ZipFile(zip_path) as zf:
        for i, c in enumerate(sorted(plan.candidates, key=lambda c: (c.split or "", c.raw_class, c.info.filename))):
            if should_stop and i % 200 == 0 and should_stop():
                raise IngestError("interrupted", "Ingestion was interrupted.")
            split_dir = c.split or "all"
            target_dir = dest / "images" / split_dir / f"{class_index[c.raw_class]:04d}"
            target_dir.mkdir(parents=True, exist_ok=True)
            target = target_dir / f"{i:07d}{c.ext}"
            limit = min(c.info.file_size, MAX_MEMBER_BYTES)
            h = hashlib.sha256()
            size = 0
            try:
                with zf.open(c.info) as src, open(target, "wb") as dst:
                    while True:
                        chunk = src.read(1024 * 1024)
                        if not chunk:
                            break
                        size += len(chunk)
                        if size > limit:
                            raise IngestError("suspicious_compression", "An archive member expanded beyond its declared size. The archive was rejected.")
                        h.update(chunk)
                        dst.write(chunk)
                written += size
                if written > max_uncompressed:
                    raise IngestError("too_large_uncompressed", "The archive expands beyond the configured size limit.")
            except IngestError:
                target.unlink(missing_ok=True)
                raise
            except (zipfile.BadZipFile, zipfile.LargeZipFile, OSError, EOFError, RuntimeError, NotImplementedError) as e:
                target.unlink(missing_ok=True)
                reason = "unsupported_compression" if isinstance(e, NotImplementedError) else "corrupt_in_archive"
                failed.append((c.original_name, reason))
                continue
            if size == 0:
                target.unlink(missing_ok=True)
                failed.append((c.original_name, "empty_file"))
                continue
            out.append(Extracted(path=target, candidate=c, sha256=h.hexdigest(), bytes=size))
            if on_progress and (i % 100 == 0 or i == n - 1):
                on_progress(i + 1, n)
    return out, failed
