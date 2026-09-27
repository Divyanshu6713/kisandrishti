"""
Class-name helpers. The raw class identifier (the dataset folder name, e.g. "Tomato___Early_blight")
is what the model is trained on and is never changed. Display labels are derived for people only.
"""
from __future__ import annotations

import re

_SEP = "___"


def display_name(raw: str) -> str:
    """'Tomato___Early_blight' → 'Tomato Early Blight'; 'Tomato___Tomato_mosaic_virus' → 'Tomato Mosaic Virus'."""
    crop, disease = split_crop(raw)
    words = _words(disease if crop else raw)
    if crop:
        crop_words = _words(crop)
        # Drop a repeated crop name at the start of the disease part.
        if [w.lower() for w in words[: len(crop_words)]] == [w.lower() for w in crop_words]:
            words = words[len(crop_words):]
        words = crop_words + words
    return " ".join(_cap(w) for w in words) or raw


def split_crop(raw: str) -> tuple[str | None, str]:
    """Crop prefix when the common 'Crop___Condition' folder convention is used; otherwise (None, raw)."""
    if _SEP in raw:
        crop, _, rest = raw.partition(_SEP)
        if crop.strip(" _") and rest.strip(" _"):
            return crop.strip(" _"), rest.strip(" _")
    return None, raw


def crop_label(raw: str) -> str | None:
    crop, _ = split_crop(raw)
    return " ".join(_cap(w) for w in _words(crop)) if crop else None


def looks_healthy(raw: str) -> bool:
    """Derived from the class name only (a 'healthy' token) — no biological claim beyond the label."""
    return "healthy" in {w.lower() for w in _words(raw)}


def _words(s: str) -> list[str]:
    s = re.sub(r"[_\-\s]+", " ", s.replace(",", ", ")).strip()
    s = re.sub(r"\s+,", ",", s)
    return [w for w in s.split(" ") if w]


def _cap(w: str) -> str:
    if w.isupper() and len(w) > 1:
        return w  # acronyms such as "TMV"
    if "(" in w:
        return w
    return w[:1].upper() + w[1:].lower()


VERSION_RE = re.compile(r"^\d{1,4}\.\d{1,4}(\.\d{1,4})?$")


def parse_version(v: str) -> tuple[int, ...] | None:
    return tuple(int(x) for x in v.split(".")) if VERSION_RE.match(v or "") else None


def suggest_next_version(existing: list[tuple[str, list[str], str]], classes: list[str], architecture: str) -> tuple[str, str]:
    """
    Suggest the next model version. `existing` = [(version, class_ids, architecture), …].
    Same class set + architecture as the latest model → minor bump; different → major bump.
    It is only a suggestion — the admin can type any unused version.
    """
    parsed = [(parse_version(v), set(c), a) for v, c, a in existing if parse_version(v)]
    if not parsed:
        return "1.0", "First model."
    parsed.sort(key=lambda t: t[0])
    latest_v, latest_classes, latest_arch = parsed[-1]
    major, minor = latest_v[0], (latest_v[1] if len(latest_v) > 1 else 0)
    if latest_classes != set(classes):
        return f"{major + 1}.0", "The class set differs from the latest model — suggested a major version."
    if latest_arch != architecture:
        return f"{major + 1}.0", "The architecture differs from the latest model — suggested a major version."
    return f"{major}.{minor + 1}", "Same classes and architecture as the latest model — suggested a minor version."
