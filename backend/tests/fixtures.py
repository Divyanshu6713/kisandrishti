"""
Tiny SYNTHETIC test fixture: coloured shapes on a green square, generated in memory.

It exists only so the automated tests can exercise loading → training → saving → loading → inference.
It is NOT crop-disease data, and a model trained on it must never be presented as a Kisan Drishti model.
Class names use the prefix "Fixture" for that reason.
"""
from __future__ import annotations

import io
import random
import zipfile
from pathlib import Path

from PIL import Image, ImageDraw

CLASSES = ["Fixture___Red_spots", "Fixture___Blue_stripes", "Fixture___healthy"]


def draw(cls: str, rng: random.Random, size: int = 64) -> Image.Image:
    g = 110 + rng.randint(-20, 20)
    im = Image.new("RGB", (size, size), (40, g, 40))
    d = ImageDraw.Draw(im)
    if cls.endswith("Red_spots"):
        for _ in range(6):
            x, y, r = rng.randint(4, size - 8), rng.randint(4, size - 8), rng.randint(3, 6)
            d.ellipse((x, y, x + r, y + r), fill=(200 + rng.randint(0, 55), 30, 30))
    elif cls.endswith("Blue_stripes"):
        for i in range(0, size, 10):
            off = rng.randint(0, 4)
            d.rectangle((i + off, 0, i + off + 3, size), fill=(30, 40, 200 + rng.randint(0, 55)))
    else:
        for _ in range(20):
            x, y = rng.randint(0, size - 1), rng.randint(0, size - 1)
            d.point((x, y), fill=(50, g + 20, 50))
    return im


def jpeg(im: Image.Image, fmt: str = "JPEG") -> bytes:
    b = io.BytesIO()
    im.save(b, fmt, quality=92) if fmt == "JPEG" else im.save(b, fmt)
    return b.getvalue()


def make_zip(path: Path, *, per_class: int = 24, structure: str = "class_folders", wrapper: str | None = "dataset", seed: int = 0,
             extra: dict[str, bytes] | None = None, classes: list[str] | None = None) -> Path:
    rng = random.Random(seed)
    classes = classes or CLASSES
    with zipfile.ZipFile(path, "w", compression=zipfile.ZIP_DEFLATED) as z:
        for cls in classes:
            for i in range(per_class):
                data = jpeg(draw(cls, rng))
                if structure == "predefined":
                    split = "train" if i < per_class * 0.6 else ("validation" if i < per_class * 0.8 else "test")
                    name = f"{split}/{cls}/img_{i:03d}.jpg"
                else:
                    name = f"{cls}/img_{i:03d}.jpg"
                z.writestr(f"{wrapper}/{name}" if wrapper else name, data)
        for name, data in (extra or {}).items():
            z.writestr(name, data)
    return path


def sample_image(cls: str = CLASSES[0], seed: int = 99, fmt: str = "JPEG") -> bytes:
    return jpeg(draw(cls, random.Random(seed)), fmt)
