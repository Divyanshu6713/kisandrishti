"""
Model artefact bundle:

    models/<model_id>/
        model.pt        weights only (state_dict) — loaded with torch.load(weights_only=True), so no
                        pickled code can ever execute when a model is loaded
        manifest.json   everything needed to run it correctly: classes + mapping, preprocessing, architecture,
                        training config, dataset lineage, metrics, library versions, weights checksum
        metrics.json    full test evaluation (per-class metrics, confusion matrix)

`export_zip` packages these three files so a model can be moved or archived as one unit.
"""
from __future__ import annotations

import io
import json
import zipfile
from pathlib import Path

from ..storage import sha256_file

WEIGHTS = "model.pt"
MANIFEST = "manifest.json"
METRICS = "metrics.json"
FORMAT = "kd-disease-model"


def save_weights(model_dir: Path, arch: str, num_classes: int, state_dict) -> tuple[str, int]:
    import torch

    model_dir.mkdir(parents=True, exist_ok=True)
    path = model_dir / WEIGHTS
    cpu = {k: v.detach().to("cpu") for k, v in state_dict.items()}
    torch.save({"format": FORMAT, "format_version": 1, "architecture": arch, "num_classes": num_classes, "state_dict": cpu}, path)
    return sha256_file(path), path.stat().st_size


def write_json(model_dir: Path, name: str, data: dict) -> None:
    (model_dir / name).write_text(json.dumps(data, indent=1, ensure_ascii=False), encoding="utf-8")


def read_manifest(model_dir: Path) -> dict:
    return json.loads((model_dir / MANIFEST).read_text(encoding="utf-8"))


class ArtifactError(Exception):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


def load_model(model_dir: Path, expected_sha256: str | None, device: str = "cpu"):
    """Rebuild the network from the manifest and load verified weights. Returns (model in eval mode, manifest)."""
    import torch

    from .architectures import build_model

    weights = model_dir / WEIGHTS
    if not weights.is_file() or not (model_dir / MANIFEST).is_file():
        raise ArtifactError("artifact_missing", "The model files are missing on disk.")
    if expected_sha256 and sha256_file(weights) != expected_sha256:
        raise ArtifactError("checksum_mismatch", "The model file does not match its recorded checksum.")
    manifest = read_manifest(model_dir)
    blob = torch.load(weights, map_location="cpu", weights_only=True)
    if blob.get("format") != FORMAT or blob.get("architecture") != manifest.get("architecture"):
        raise ArtifactError("incompatible", "The model file is not compatible with its manifest.")
    n = len(manifest["classes"])
    if blob.get("num_classes") != n:
        raise ArtifactError("incompatible", "The model's class count does not match its manifest.")
    model = build_model(manifest["architecture"], n, pretrained=False)
    model.load_state_dict(blob["state_dict"])
    model.eval().to(device)
    return model, manifest


def export_zip(model_dir: Path) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", compression=zipfile.ZIP_DEFLATED) as z:
        for name in (MANIFEST, METRICS, WEIGHTS):
            p = model_dir / name
            if p.is_file():
                z.write(p, arcname=name)
    return buf.getvalue()
