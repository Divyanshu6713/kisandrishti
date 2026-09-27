"""
Train/validation/test splitting.

* Predefined folders (train/validation/test in the upload) are respected exactly — never reshuffled.
* Otherwise a stratified, duplicate-aware random split is generated:
    - stratified: each class is split separately, so every class keeps its share in each partition;
    - duplicate-aware: exact/near-identical copies (validate.duplicate_groups) move together, so a copy
      of a test image can never sit in the training set;
    - reproducible: the shuffle for class C uses random.Random(f"{seed}:{C}") (string seeds are hashed
      with SHA-512 by Python, so the result does not depend on PYTHONHASHSEED or file order).
"""
from __future__ import annotations

import random
from collections import Counter, defaultdict

from ..naming import display_name

SPLITS = ("train", "val", "test")


def validate_percentages(train: float, val: float, test: float) -> None:
    for name, v in (("Train", train), ("Validation", val), ("Test", test)):
        if not (0 <= v <= 100):
            raise ValueError(f"{name} percentage must be between 0 and 100.")
    if abs(train + val + test - 100) > 1e-6:
        raise ValueError(f"Train + Validation + Test must equal 100% (got {train + val + test:g}%).")
    if train <= 0 or val <= 0 or test <= 0:
        raise ValueError("Train, validation and test must each be greater than 0%.")


def stratified_group_split(entries: list[dict], groups: list[int], train: float, val: float, test: float, seed: int) -> tuple[list[str], list[dict]]:
    validate_percentages(train, val, test)
    # A duplicate group is assigned as one unit and counted under its most common class.
    group_members: dict[int, list[int]] = defaultdict(list)
    for i, g in enumerate(groups):
        group_members[g].append(i)
    class_groups: dict[str, list[int]] = defaultdict(list)
    for g, members in group_members.items():
        cls = Counter(entries[i]["class"] for i in members).most_common(1)[0][0]
        class_groups[cls].append(g)

    assign: list[str] = [""] * len(entries)
    warnings: list[dict] = []
    for cls in sorted(class_groups):
        gs = sorted(class_groups[cls])  # deterministic order before the seeded shuffle
        rng = random.Random(f"{seed}:{cls}")
        rng.shuffle(gs)
        n = sum(len(group_members[g]) for g in gs)
        if n < 3:
            for g in gs:
                for i in group_members[g]:
                    assign[i] = "train"
            warnings.append({"code": "class_too_small_to_split", "severity": "warning", "message": f"{display_name(cls)} has only {n} image(s); all were put in training, so it cannot be validated or tested."})
            continue
        n_test = max(1, round(n * test / 100))
        n_val = max(1, round(n * val / 100))
        filled = {"test": 0, "val": 0, "train": 0}
        for g in gs:
            size = len(group_members[g])
            if filled["test"] < n_test:
                part = "test"
            elif filled["val"] < n_val:
                part = "val"
            else:
                part = "train"
            filled[part] += size
            for i in group_members[g]:
                assign[i] = part
        if filled["train"] == 0:
            warnings.append({"code": "class_no_train", "severity": "warning", "message": f"{display_name(cls)} ended up with no training images (its duplicate groups are large). Consider a different split or more images."})
    return assign, warnings


def summarise(entries: list[dict], assign: list[str]) -> tuple[dict[str, int], dict[str, dict[str, int]]]:
    counts = Counter(assign)
    per_class: dict[str, dict[str, int]] = defaultdict(lambda: {s: 0 for s in SPLITS})
    for e, s in zip(entries, assign):
        if s in SPLITS:
            per_class[e["class"]][s] += 1
    return {s: counts.get(s, 0) for s in SPLITS}, dict(per_class)
