"""Dataset/DataLoader built from a dataset manifest + split assignment (never by globbing folders)."""
from __future__ import annotations

from pathlib import Path

import torch
from torch.utils.data import Dataset

from .preprocessing import load_rgb


class ManifestDataset(Dataset):
    """Items are (relative path, class index). Top-level class so DataLoader workers can pickle it on Windows."""

    def __init__(self, root: Path, items: list[tuple[str, int]], transform):
        self.root = Path(root)
        self.items = items
        self.transform = transform

    def __len__(self) -> int:
        return len(self.items)

    def __getitem__(self, i: int):
        rel, label = self.items[i]
        img = load_rgb(str(self.root / rel))
        return self.transform(img), label


def seed_worker(worker_id: int) -> None:
    import random

    import numpy as np

    s = torch.initial_seed() % 2**32
    np.random.seed(s)
    random.seed(s)
