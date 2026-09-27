"""
Supported backbones (all from torchvision, ImageNet-pretrained, fine-tuned by transfer learning).

Why these, for Kisan Drishti's MVP (server-side CPU inference, training on one 6 GB laptop GPU or a
rented GPU, possible later mobile/web export):
  * efficientnet_b0   — default. ~5.3 M params, ~16 MB; strong accuracy for its size; fits 6 GB at batch 32.
  * mobilenet_v3_large — fastest CPU inference and smallest (~5.5 M params, ~17 MB); best for mobile/web later,
                         usually slightly less accurate.
  * resnet18          — simple, robust baseline (~11.7 M params, ~45 MB).
  * resnet50          — heavier (~25.6 M params, ~98 MB); only if data is large and latency is not a concern.
Parameter counts/sizes are torchvision's published figures for the ImageNet models (head size changes a little).
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Arch:
    id: str
    label: str
    weights: str
    params_m: float
    size_mb: int
    note: str


ARCHITECTURES: dict[str, Arch] = {
    a.id: a
    for a in (
        Arch("efficientnet_b0", "EfficientNet-B0", "IMAGENET1K_V1", 5.3, 16, "Recommended default: good accuracy for its size, fast enough on CPU."),
        Arch("mobilenet_v3_large", "MobileNetV3-Large", "IMAGENET1K_V2", 5.5, 17, "Fastest on CPU and phones; usually a little less accurate."),
        Arch("resnet18", "ResNet-18", "IMAGENET1K_V1", 11.7, 45, "Simple, robust baseline."),
        Arch("resnet50", "ResNet-50", "IMAGENET1K_V2", 25.6, 98, "Heavier; consider only for large datasets."),
    )
}

DEFAULT_ARCHITECTURE = "efficientnet_b0"


def build_model(arch: str, num_classes: int, pretrained: bool):
    import torch.nn as nn
    from torchvision import models

    if arch not in ARCHITECTURES:
        raise ValueError(f"Unknown architecture {arch!r}")
    weights = ARCHITECTURES[arch].weights if pretrained else None
    m = models.get_model(arch, weights=weights)
    if arch.startswith("resnet"):
        m.fc = nn.Linear(m.fc.in_features, num_classes)
    else:  # efficientnet / mobilenet_v3: last layer of the classifier block
        last = m.classifier[-1]
        m.classifier[-1] = nn.Linear(last.in_features, num_classes)
    return m


def head_module_name(arch: str) -> str:
    return "fc" if arch.startswith("resnet") else "classifier"


def set_backbone_trainable(model, arch: str, trainable: bool) -> None:
    head = head_module_name(arch)
    for name, p in model.named_parameters():
        if not name.startswith(head + "."):
            p.requires_grad = trainable
