"""
Classification metrics computed from real predictions (numpy only).

Definitions shown to admins:
  * accuracy          — correct predictions / all test images
  * per-class P/R/F1  — precision = TP/(TP+FP), recall = TP/(TP+FN), F1 = harmonic mean; support = test images of the class
  * macro average     — unweighted mean over classes that have test images (every class counts equally)
  * weighted average  — mean weighted by support (large classes count more)
If a class received no predictions its precision is undefined; it is reported as 0 and flagged.
"""
from __future__ import annotations

import numpy as np


def confusion_matrix(y_true: np.ndarray, y_pred: np.ndarray, n: int) -> np.ndarray:
    cm = np.zeros((n, n), dtype=np.int64)
    np.add.at(cm, (y_true.astype(np.int64), y_pred.astype(np.int64)), 1)
    return cm


def report(cm: np.ndarray, class_ids: list[str], display: list[str]) -> dict:
    n = cm.shape[0]
    tp = np.diag(cm).astype(float)
    support = cm.sum(axis=1).astype(float)
    predicted = cm.sum(axis=0).astype(float)
    per_class = []
    for i in range(n):
        p_def = predicted[i] > 0
        r_def = support[i] > 0
        p = tp[i] / predicted[i] if p_def else 0.0
        r = tp[i] / support[i] if r_def else 0.0
        f = 2 * p * r / (p + r) if (p + r) > 0 else 0.0
        per_class.append({
            "index": i, "class_id": class_ids[i], "display_name": display[i],
            "precision": round(p, 6), "recall": round(r, 6), "f1": round(f, 6), "support": int(support[i]),
            "predicted": int(predicted[i]), "precision_defined": bool(p_def), "has_test_images": bool(r_def),
        })
    present = [c for c in per_class if c["has_test_images"]]
    total = float(support.sum())

    def macro(key: str) -> float | None:
        return round(float(np.mean([c[key] for c in present])), 6) if present else None

    def weighted(key: str) -> float | None:
        return round(float(sum(c[key] * c["support"] for c in present) / total), 6) if total else None

    confused = []
    for i in range(n):
        for j in range(n):
            if i != j and cm[i, j] > 0:
                confused.append({"true": class_ids[i], "true_display": display[i], "predicted": class_ids[j], "predicted_display": display[j],
                                 "count": int(cm[i, j]), "share_of_true": round(cm[i, j] / support[i], 6) if support[i] else None})
    confused.sort(key=lambda d: (-d["count"], d["true"]))
    return {
        "test_images": int(total),
        "accuracy": round(float(tp.sum() / total), 6) if total else None,
        "macro": {"precision": macro("precision"), "recall": macro("recall"), "f1": macro("f1"), "classes_averaged": len(present)},
        "weighted": {"precision": weighted("precision"), "recall": weighted("recall"), "f1": weighted("f1")},
        "per_class": per_class,
        "most_confused": confused[:20],
        "classes_without_test_images": [c["class_id"] for c in per_class if not c["has_test_images"]],
        "classes_never_predicted": [c["class_id"] for c in per_class if not c["precision_defined"]],
    }


def top_k_accuracy(probs: np.ndarray, y_true: np.ndarray, k: int) -> float | None:
    if len(y_true) == 0:
        return None
    k = min(k, probs.shape[1])
    topk = np.argsort(-probs, axis=1)[:, :k]
    return round(float(np.mean([y in row for y, row in zip(y_true, topk)])), 6)


def macro_f1(y_true: np.ndarray, y_pred: np.ndarray, n: int) -> float | None:
    cm = confusion_matrix(y_true, y_pred, n)
    r = report(cm, [str(i) for i in range(n)], [str(i) for i in range(n)])
    return r["macro"]["f1"]
