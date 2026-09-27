"""
THE preprocessing contract — the only place image → tensor rules are defined.

Training (validation/test passes), admin test predictions and production inference all build their
transforms from the *saved* preprocessing dict of the model through this module, so there is no second
copy to drift. The dict is stored in the model manifest; changing these rules requires bumping
PREPROCESSING_VERSION, and older models keep working because they carry their own settings.
"""
from __future__ import annotations

from typing import IO, Any

from PIL import Image, ImageOps

PREPROCESSING_VERSION = 1
IMAGENET_MEAN = (0.485, 0.456, 0.406)
IMAGENET_STD = (0.229, 0.224, 0.225)


def make_preprocessing(image_size: int) -> dict[str, Any]:
    return {
        "version": PREPROCESSING_VERSION,
        "image_size": image_size,
        "input_shape": [1, 3, image_size, image_size],
        "load": {"exif_transpose": True, "color_mode": "RGB", "alpha": "dropped (convert to RGB)"},
        "resize": {"strategy": "shorter_side_then_center_crop", "shorter_side": image_size, "crop": image_size, "interpolation": "bilinear", "antialias": True},
        "tensor": {"layout": "NCHW", "dtype": "float32", "scale": "pixel / 255"},
        "normalize": {"mean": list(IMAGENET_MEAN), "std": list(IMAGENET_STD)},
    }


def make_augmentation(enabled: bool) -> dict[str, Any]:
    """
    Training-only augmentation. Chosen to imitate phone photos without changing what a symptom looks like:
    * crops/zoom (scale 0.7–1.0), flips and ±20° rotation — lesions have no canonical orientation;
    * mild brightness/contrast (±20 %) and saturation (±10 %) — sun, shade and camera differences;
    * hue shift limited to ±0.02 — colour IS the symptom (yellow chlorosis vs brown necrosis), so large
      hue jitter would turn a diseased leaf into a healthy-looking one.
    No blur, elastic warps or colour inversion. Validation/test images are never augmented.
    """
    if not enabled:
        return {"enabled": False}
    return {
        "enabled": True,
        "random_resized_crop": {"scale": [0.7, 1.0], "ratio": [0.75, 1.3333]},
        "horizontal_flip_p": 0.5,
        "vertical_flip_p": 0.2,
        "rotation_degrees": 20,
        "color_jitter": {"brightness": 0.2, "contrast": 0.2, "saturation": 0.1, "hue": 0.02},
    }


def load_rgb(src: str | IO[bytes]) -> Image.Image:
    """Decode, apply EXIF orientation (phone photos), and convert to 3-channel RGB."""
    with Image.open(src) as im:
        im = ImageOps.exif_transpose(im)
        return im.convert("RGB")


def _interp():
    from torchvision.transforms import InterpolationMode

    return InterpolationMode.BILINEAR


def eval_transform(pre: dict[str, Any]):
    """Deterministic transform used for validation, test, admin test predictions and production."""
    from torchvision import transforms as T

    if pre.get("version") != PREPROCESSING_VERSION:
        raise ValueError(f"Unsupported preprocessing version {pre.get('version')!r}")
    r = pre["resize"]
    return T.Compose([
        T.Resize(r["shorter_side"], interpolation=_interp(), antialias=r.get("antialias", True)),
        T.CenterCrop(r["crop"]),
        T.ToTensor(),
        T.Normalize(pre["normalize"]["mean"], pre["normalize"]["std"]),
    ])


def train_transform(pre: dict[str, Any], aug: dict[str, Any]):
    from torchvision import transforms as T

    if not aug.get("enabled"):
        return eval_transform(pre)
    size = pre["resize"]["crop"]
    cj = aug["color_jitter"]
    return T.Compose([
        T.RandomResizedCrop(size, scale=tuple(aug["random_resized_crop"]["scale"]), ratio=tuple(aug["random_resized_crop"]["ratio"]), interpolation=_interp(), antialias=True),
        T.RandomHorizontalFlip(aug["horizontal_flip_p"]),
        T.RandomVerticalFlip(aug["vertical_flip_p"]),
        T.RandomRotation(aug["rotation_degrees"], interpolation=_interp()),
        T.ColorJitter(brightness=cj["brightness"], contrast=cj["contrast"], saturation=cj["saturation"], hue=cj["hue"]),
        T.ToTensor(),
        T.Normalize(pre["normalize"]["mean"], pre["normalize"]["std"]),
    ])
