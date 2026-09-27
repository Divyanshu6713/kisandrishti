"""
Dataset validation: every number in the report is computed from the extracted files.

Per image: Pillow decodes the file fully (not just the header), the real format is detected from the
content (not the extension), dimensions are read, and two fingerprints are computed:
  * SHA-256 of the bytes             → exact duplicates
  * 64-bit difference hash (dHash)   → visually near-identical images (Hamming distance ≤ 2 of 64 bits)
The dHash check is a simple perceptual hash. It finds resized/re-encoded copies of the same photo; it
can miss heavily edited copies and can occasionally flag two different but very similar photos.

No quality "score" is produced — only factual counts and warnings.
"""
from __future__ import annotations

import hashlib
import warnings
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from pathlib import Path
from typing import Callable

from PIL import Image, UnidentifiedImageError

from ..naming import display_name

ALLOWED_FORMATS = {"JPEG": ".jpg", "MPO": ".jpg", "PNG": ".png", "WEBP": ".webp", "BMP": ".bmp"}
TINY_EDGE = 64
NEAR_DUP_DISTANCE = 2
MAX_NEAR_GROUP = 8
SPLIT_NAME = {"train": "train", "val": "validation", "test": "test"}


@dataclass
class ImageCheck:
    ok: bool
    reason: str | None = None
    width: int = 0
    height: int = 0
    format: str | None = None
    mode: str | None = None
    dhash: int | None = None


def check_image(path: Path, max_pixels: int) -> ImageCheck:
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(path) as im:
                fmt = im.format
                w, h = im.size
                if fmt not in ALLOWED_FORMATS:
                    return ImageCheck(False, "unsupported_format", w, h, fmt)
                if w * h > max_pixels:
                    return ImageCheck(False, "too_many_pixels", w, h, fmt)
                im.verify()
            with Image.open(path) as im:
                im.load()  # full decode: catches truncated files that verify() misses
                mode = im.mode
                g = im.convert("L").resize((9, 8), Image.Resampling.BILINEAR)
                px = g.tobytes()
        bits = 0
        for row in range(8):
            for col in range(8):
                bits = (bits << 1) | (1 if px[row * 9 + col] > px[row * 9 + col + 1] else 0)
        return ImageCheck(True, None, w, h, fmt, mode, bits)
    except (Image.DecompressionBombError, Image.DecompressionBombWarning):
        return ImageCheck(False, "too_many_pixels")
    except (UnidentifiedImageError, OSError, SyntaxError, ValueError, EOFError):
        return ImageCheck(False, "corrupt_or_unreadable")


def check_many(paths: list[Path], max_pixels: int, on_progress: Callable[[int, int], None] | None = None, workers: int = 4) -> list[ImageCheck]:
    out: list[ImageCheck] = [ImageCheck(False)] * len(paths)
    done = 0
    with ThreadPoolExecutor(max_workers=workers) as pool:
        for i, res in enumerate(pool.map(lambda p: check_image(p, max_pixels), paths, chunksize=32)):
            out[i] = res
            done += 1
            if on_progress and (done % 100 == 0 or done == len(paths)):
                on_progress(done, len(paths))
    return out


class _UnionFind:
    def __init__(self, n: int):
        self.p = list(range(n))

    def find(self, a: int) -> int:
        while self.p[a] != a:
            self.p[a] = self.p[self.p[a]]
            a = self.p[a]
        return a

    def union(self, a: int, b: int) -> None:
        ra, rb = self.find(a), self.find(b)
        if ra != rb:
            self.p[max(ra, rb)] = min(ra, rb)


def duplicate_groups(entries: list[dict]) -> tuple[list[int], dict]:
    """
    Groups images that are exact (same SHA-256) or near-identical (dHash distance ≤ 2) copies.
    Returns (group id per entry, stats). Group ids are used by the splitter so copies never land in
    different partitions (which would leak test images into training).

    Guard: a near-duplicate cluster larger than MAX_NEAR_GROUP images is almost always many *different*
    photos that share a plain background, not copies. Such clusters are reported but only their exact
    copies are kept together — otherwise one giant "group" could push a whole class into one partition.
    """
    n = len(entries)
    exact = _UnionFind(n)
    by_sha: dict[str, list[int]] = defaultdict(list)
    for i, e in enumerate(entries):
        by_sha[e["sha256"]].append(i)
    exact_groups = [ix for ix in by_sha.values() if len(ix) > 1]
    for ix in exact_groups:
        for j in ix[1:]:
            exact.union(ix[0], j)

    # Near duplicates: split 64 bits into 3 bands; by the pigeonhole principle two hashes within
    # distance 2 share at least one identical band, so only same-band pairs need comparing.
    near = _UnionFind(n)
    for ix in exact_groups:
        for j in ix[1:]:
            near.union(ix[0], j)
    skipped_buckets = 0
    pairs: list[tuple[int, int]] = []
    bands = ((0, 22), (22, 43), (43, 64))
    for lo, hi in bands:
        mask = ((1 << (hi - lo)) - 1) << lo
        buckets: dict[int, list[int]] = defaultdict(list)
        for i, e in enumerate(entries):
            buckets[(e["dhash"] & mask) >> lo].append(i)
        for ix in buckets.values():
            if len(ix) < 2:
                continue
            if len(ix) > 400:  # e.g. many blank images; comparing would be quadratic
                skipped_buckets += 1
                continue
            for a in range(len(ix)):
                ha = entries[ix[a]]["dhash"]
                for b in range(a + 1, len(ix)):
                    if entries[ix[a]]["sha256"] == entries[ix[b]]["sha256"]:
                        continue
                    if bin(ha ^ entries[ix[b]]["dhash"]).count("1") <= NEAR_DUP_DISTANCE:
                        pairs.append((ix[a], ix[b]))
                        near.union(ix[a], ix[b])

    near_members: dict[int, list[int]] = defaultdict(list)
    for i in range(n):
        near_members[near.find(i)].append(i)
    large_clusters = [m for m in near_members.values() if len(m) > MAX_NEAR_GROUP]
    in_large = {i for m in large_clusters for i in m}

    # Final grouping: exact copies always; near-identical links only inside small clusters.
    uf = _UnionFind(n)
    for ix in exact_groups:
        for j in ix[1:]:
            uf.union(ix[0], j)
    near_links = 0
    for a, b in pairs:
        if a in in_large:
            continue
        if uf.find(a) != uf.find(b):
            near_links += 1
        uf.union(a, b)

    groups = [uf.find(i) for i in range(n)]
    members: dict[int, list[int]] = defaultdict(list)
    for i, g in enumerate(groups):
        members[g].append(i)
    multi = [m for m in members.values() if len(m) > 1]
    cross_class = [m for m in multi if len({entries[i]["class"] for i in m}) > 1]
    cross_split = [m for m in multi if len({entries[i]["split"] for i in m if entries[i]["split"]}) > 1]

    def sample(groups_: list[list[int]]) -> list[list[dict]]:
        return [[{"class": entries[i]["class"], "split": entries[i]["split"], "file": entries[i]["original"]} for i in g[:4]] for g in groups_[:10]]

    stats = {
        "method": f"SHA-256 (exact copies) + 64-bit dHash, Hamming distance ≤ {NEAR_DUP_DISTANCE} (near-identical, clusters up to {MAX_NEAR_GROUP} images)",
        "exact_duplicate_groups": len(exact_groups),
        "exact_duplicate_images": sum(len(g) - 1 for g in exact_groups),
        "near_duplicate_links": near_links,
        "duplicate_groups": len(multi),
        "images_in_duplicate_groups": sum(len(m) for m in multi),
        "cross_class_groups": len(cross_class),
        "cross_split_groups": len(cross_split),
        "large_similarity_clusters": len(large_clusters),
        "images_in_large_similarity_clusters": len(in_large),
        "buckets_not_compared": skipped_buckets,
        "examples": sample(multi),
        "cross_class_examples": sample(cross_class),
        "cross_split_examples": sample(cross_split),
    }
    return groups, stats


def content_hash(entries: list[dict]) -> str:
    h = hashlib.sha256()
    for line in sorted(f"{e['class']}\t{e['split'] or ''}\t{e['sha256']}" for e in entries):
        h.update(line.encode())
        h.update(b"\n")
    return h.hexdigest()


def _pct(a: int, b: int) -> float:
    return round(100.0 * a / b, 1) if b else 0.0


def build_report(
    *,
    structure: str,
    entries: list[dict],
    rejected: list[dict],
    skipped_counts: dict[str, int],
    skipped_samples: dict[str, list[str]],
    class_dirs: dict[str | None, set[str]],
    dup_stats: dict,
    min_per_class: int,
) -> dict:
    """Everything the admin sees on the Validation screen. Returns {"status", "summary", "classes", "warnings", …}."""
    warnings_: list[dict] = []

    def warn(code: str, severity: str, message: str, **details):
        warnings_.append({"code": code, "severity": severity, "message": message, **({"details": details} if details else {})})

    total = len(entries)
    per_class = Counter(e["class"] for e in entries)
    per_class_split: dict[str, Counter] = defaultdict(Counter)
    for e in entries:
        per_class_split[e["class"]][e["split"] or "unsplit"] += 1
    classes = sorted(per_class)
    split_counts = Counter(e["split"] or "unsplit" for e in entries)

    all_dirs = set().union(*class_dirs.values()) if class_dirs else set()
    empty = sorted(all_dirs - set(classes))
    for c in empty:
        warn("empty_class", "warning", f"The folder “{c}” contains no valid images, so it is not used as a class.")

    if total == 0:
        warn("no_images", "error", "No valid images were found in the archive.")
    elif len(classes) < 2:
        warn("too_few_classes", "error", f"Only {len(classes)} class with images was found. A classifier needs at least 2 classes.")

    for c in classes:
        if per_class[c] < min_per_class:
            warn("few_images", "warning", f"{display_name(c)} has only {per_class[c]} images (fewer than {min_per_class}). Results for this class will be unreliable.", class_id=c, count=per_class[c])

    if len(classes) >= 2:
        hi_c = max(classes, key=lambda c: per_class[c])
        lo_c = min(classes, key=lambda c: per_class[c])
        ratio = per_class[hi_c] / max(1, per_class[lo_c])
        if ratio >= 10:
            sev, word = "warning", "highly imbalanced"
        elif ratio >= 3:
            sev, word = "info", "moderately imbalanced"
        else:
            sev, word = None, None
        if sev:
            warn(
                "class_imbalance",
                sev,
                f"{display_name(lo_c)} contains {per_class[lo_c]:,} images while {display_name(hi_c)} contains {per_class[hi_c]:,} ({ratio:.1f}× more). This dataset is {word}.",
                smallest=lo_c,
                largest=hi_c,
                ratio=round(ratio, 2),
            )

    if structure == "predefined_splits":
        present_splits = {s for s in class_dirs if s}
        for s in ("train", "val", "test"):
            if s not in present_splits or split_counts.get(s, 0) == 0:
                warn("missing_split", "warning", f"No “{SPLIT_NAME[s]}” folder with images was found. Generate a split before training, or re-upload with all three folders.", split=s)
        for c in classes:
            missing = [s for s in ("train", "val", "test") if per_class_split[c].get(s, 0) == 0 and split_counts.get(s, 0) > 0]
            if missing:
                names = ", ".join(SPLIT_NAME[m] for m in missing)
                warn("class_missing_in_split", "warning", f"{display_name(c)} has no images in: {names}.", class_id=c, splits=missing)

    corrupt = [r for r in rejected if r["reason"] in ("corrupt_or_unreadable", "corrupt_in_archive", "empty_file")]
    if corrupt:
        warn("corrupt_images", "warning", f"{len(corrupt):,} files could not be decoded as images and were excluded.")
    unsupported = [r for r in rejected if r["reason"] in ("unsupported_format", "too_many_pixels", "unsupported_compression")]
    if unsupported:
        warn("unsupported_images", "warning", f"{len(unsupported):,} files were excluded (unsupported image format, compression method or too many pixels).")
    ext_mismatch = sum(1 for e in entries if e.get("ext_mismatch"))
    if ext_mismatch:
        warn("extension_mismatch", "info", f"{ext_mismatch:,} images have a file extension that does not match their real format. They were kept and stored with the correct extension.")
    if skipped_counts.get("executable_or_script"):
        warn("executables", "warning", f"{skipped_counts['executable_or_script']:,} executable or script files were found in the archive and ignored.")
    unknown = skipped_counts.get("not_an_image", 0) + skipped_counts.get("outside_class_folder", 0) + skipped_counts.get("invalid_class_name", 0)
    if unknown:
        warn("unknown_files", "info", f"{unknown:,} files were ignored (not images, or not inside a class folder).")
    if skipped_counts.get("encrypted"):
        warn("encrypted", "warning", f"{skipped_counts['encrypted']:,} password-protected files were ignored.")

    tiny = sum(1 for e in entries if min(e["w"], e["h"]) < TINY_EDGE)
    if tiny:
        warn("tiny_images", "warning", f"{tiny:,} images are smaller than {TINY_EDGE} px on one side. They will be heavily upscaled during training.")
    nested = sum(1 for e in entries if e.get("nested"))
    if nested:
        warn("nested_folders", "info", f"{nested:,} images were inside sub-folders of a class folder; they were assigned to that class.")

    if dup_stats["exact_duplicate_images"]:
        warn("exact_duplicates", "warning", f"{dup_stats['exact_duplicate_images']:,} images are exact byte-for-byte copies of another image.")
    if dup_stats["near_duplicate_links"]:
        warn("near_duplicates", "info", f"{dup_stats['near_duplicate_links']:,} additional near-identical image pairs were found (perceptual hash). Automatic splits keep each group in one partition.")
    if dup_stats.get("large_similarity_clusters"):
        warn("similar_image_clusters", "info", f"{dup_stats['images_in_large_similarity_clusters']:,} images form {dup_stats['large_similarity_clusters']:,} large clusters of very similar-looking images (often a shared plain background). They are not treated as copies; check that the model is not learning the background.")
    if dup_stats["cross_class_groups"]:
        warn("duplicate_label_conflict", "warning", f"{dup_stats['cross_class_groups']:,} duplicate groups appear under more than one class — possible labelling errors.")
    if dup_stats["cross_split_groups"]:
        warn("duplicate_split_leak", "warning", f"{dup_stats['cross_split_groups']:,} duplicate groups appear in more than one of the provided train/validation/test folders. Test results may be optimistic.")

    dims = Counter((e["w"], e["h"]) for e in entries)
    formats = Counter(e["format"] for e in entries)
    widths = [e["w"] for e in entries]
    heights = [e["h"] for e in entries]
    total_bytes = sum(e["bytes"] for e in entries)

    errors = [w for w in warnings_ if w["severity"] == "error"]
    status = "invalid" if errors else ("ready_with_warnings" if any(w["severity"] == "warning" for w in warnings_) else "ready")

    reject_counts = Counter(r["reason"] for r in rejected)
    return {
        "status": status,
        "structure": structure,
        "summary": {
            "total_images": total,
            "class_count": len(classes),
            "total_bytes": total_bytes,
            "split_counts": {k: split_counts.get(k, 0) for k in (("train", "val", "test") if structure == "predefined_splits" else ("unsplit",))},
            "split_percent": {k: _pct(split_counts.get(k, 0), total) for k in (("train", "val", "test") if structure == "predefined_splits" else ("unsplit",))},
            "dimensions": {
                "min_width": min(widths) if widths else None,
                "max_width": max(widths) if widths else None,
                "min_height": min(heights) if heights else None,
                "max_height": max(heights) if heights else None,
                "common": [{"width": w, "height": h, "count": n} for (w, h), n in dims.most_common(5)],
            },
            "formats": dict(formats.most_common()),
            "rejected": dict(reject_counts),
            "skipped": dict(skipped_counts),
            "tiny_images": tiny,
        },
        "classes": [
            {
                "raw_name": c,
                "display_name": display_name(c),
                "count": per_class[c],
                "by_split": dict(per_class_split[c]),
            }
            for c in classes
        ],
        "empty_classes": empty,
        "duplicates": dup_stats,
        "warnings": warnings_,
        "rejected_samples": rejected[:50],
        "skipped_samples": skipped_samples,
    }
