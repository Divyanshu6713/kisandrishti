# Kisan Drishti — Production ML Integration Plan (Disease Analysis)

Status: **PLAN ONLY. Nothing below has been implemented, trained, moved or uploaded.**
Prepared: 24 Sep 2026 · Scope: turn the prototype disease analysis into a real, measured, ML-backed service.

---

## A. Existing system analysis

### What exists (verified in the code)

| Area | Finding |
|---|---|
| Stack | React 19, Vite 6, TypeScript 5.9, Tailwind 3.4, react-router 7, zustand 5, R3F/three (3D), framer-motion. `@supabase/supabase-js` was added for the new auth layer. |
| Backend | **None.** It is deployed as a Render **static site** (`render.yaml`). The repo has no Python code and no ML dependencies. |
| Service layer | `src/services/*`. The UI never calls `fetch` or imports JSON directly. Repository adapters (`data/localAdapter`, `data/restAdapter`) switch via `VITE_DATA_SOURCE`. |
| Disease pipeline | `diseaseAnalysisService.analyze()`: preprocess → `activeClassifier.classify()` → knowledge lookup (`diseases.json`) → `recsFor()` recommendations → caveats → `Analysis<DiseaseAnalysisResult>` with a `Basis`. |
| Classifier seam | `services/disease/classifiers.ts` defines a `DiseaseClassifier` interface with two implementations. **`demoClassifier`** does **not** look at pixels: bundled samples return their reference label with a *simulated* score, and any real photo returns `unidentified`. **`remoteClassifier`** (`VITE_DISEASE_MODEL=remote`) sends `POST {API_BASE}/v1/models/disease/predict` with JSON `{crop, size, imageBase64}`. |
| Preprocessing | `services/disease/imagePreprocessing.ts` runs in the browser: it checks the type (JPEG/PNG/WebP) and size (≤ 8 MB), decodes, rejects images under 64 × 64, centre-crops, resizes to 224 × 224 and measures HSV colour shares (leaf coverage, green/yellow/brown/pale). If leaf coverage is below 12 %, the result is "insufficient". The 224 px **re-encoded JPEG** is what `remoteClassifier` would send. |
| Contracts | `models/disease.ts`: `ClassifierPrediction {label, score, alternatives, modelId, simulated}`, `DiseaseAnalysisResult`, `DiseaseInfo`, `ConditionWindow`. |
| Knowledge | `data/diseases.json` holds **6 entries**: yellow-rust, leaf-rust, powdery-mildew (wheat), aphid (wheat/mustard), rice-blast, late-blight (potato). `data/crops.json` has wheat, rice, maize, chickpea, mustard, potato. |
| Recommendations | `recommendationService` (Farm Advisor) combines soil, crop, risk, organic and scans. Disease scans feed `riskPredictionService` (a saved scan raises disease risk from 82 to 97 in the demo story). |
| Disease UI | `pages/app/Disease.tsx` offers upload plus illustrated samples, pipeline steps, the result with caveats, and "Save to field log". |
| Deployment | Static site on Render, with SPA rewrite and security headers (CSP `connect-src` must list any inference API origin). |

### What can be reused
- The `DiseaseClassifier` seam, `ClassifierPrediction`, and the `Analysis` / `Basis` / `insufficient` pattern.
- Browser-side checks as a **fast pre-check** for type, size, minimum dimensions and "is there a leaf" (the server must repeat them).
- `diseaseAnalysisService` as the one place that turns model output into a `DiseaseAnalysisResult`.
- The knowledge + recommendation layers (`DiseaseInfo`, `recsFor`, Farm Advisor, risk engine).
- The Disease page UI, which already shows caveats, low confidence and "confirm with KVK".

### What needs modification
- **Crop coverage mismatch.** The datasets cover cotton, groundnut, maize, pea, potato, tomato and wheat. `crops.json` lacks cotton, groundnut, pea and tomato, and has rice, chickpea and mustard, which have no images. Every class the model can output needs a `DiseaseInfo` knowledge entry, **written from verified agronomic sources**. Without one, the result must show "no verified guidance yet" rather than invented advice.
- **The `ClassifierPrediction` contract** needs a `status` (`ok | uncertain | unsupported | poor_quality`), calibrated probabilities, a model/dataset version and quality flags.
- **`remoteClassifier` input.** Today it would send a browser re-encoded 224 px JPEG. That risks **train/serve skew** (different resize and crop, double JPEG compression). Send the original file (multipart, capped) and preprocess on the server with *the same code used in training*.
- Risk logic currently keys on disease *names*. It should key on stable class/knowledge IDs.

### What needs to be added
- `ml/`: a Python project for the dataset audit, manifest, splits, training, evaluation and export. It can live in this repo without images, or in a separate repo.
- An inference service (Python) with an image validator, preprocessor, model runtime, calibration and abstention.
- Model registry metadata (model card, class map, thresholds, dataset/config hashes).
- Knowledge entries for every supported class, with sources.

---

## B. Dataset inventory

**The datasets could not be found on this laptop.** Searched (read-only):
- C:, D: and E: for folders or archives named after the crops (cotton, groundnut, maize, tomato, wheat, potato, pea), PlantVillage, "leaf disease", and typical class folders (healthy, blight, rust, mildew).
- Every folder holding 100+ images.

The only image-heavy folders are personal phone photo/screenshot folders (not opened). Nothing matched a crop-disease dataset.

So this section **deliberately contains no class names, counts or splits.** P0 step 1 produces it with a read-only audit script once you give the path. The report will have this shape:

```
dataset_audit/2026-xx-xx/
  inventory.csv          crop, raw_class, n_images, formats, min/median/max WxH, n_corrupt, n_tiny, n_exact_dup, n_near_dup_groups, has_split_folders
  problems.md            every issue found, nothing fixed
  duplicates.csv         exact (sha256) and near (perceptual-hash) groups, incl. cross-class and cross-split
  sources.md             README / LICENSE / citation files found per dataset
```

## C. Dataset problems to check (checklist, not findings)

Per the brief, the audit reports these and does **not** fix them:
- Classes per crop, exact names, whether a *healthy* class exists per crop.
- Imbalance (max/min ratio per crop and overall).
- Corrupt or undecodable files, unsupported extensions, zero-byte files, CMYK/16-bit/alpha oddities.
- Exact duplicates (sha256) and near-duplicates (pHash/dHash distance). **Pre-augmented datasets** are a known risk: some public dumps contain rotated/flipped copies of one photo, which silently leak across splits.
- The same image under two labels (label conflict).
- Tiny images, extreme aspect ratios, inconsistent dimensions (hints that different sources were mixed).
- Suspicious folders: `__MACOSX`, thumbnails, "test" folders without labels, class names with typos or two spellings.
- Ambiguous labels: pest vs disease, nutrient deficiency labelled as disease, "diseased" without a disease name.
- Existing train/val/test folders, and duplicates across them.
- **Background/source shortcut risk.** If one crop's images all come from a lab dataset with plain backgrounds and another's from field photos, a model can learn "background = crop/disease". The audit will sample image grids per class for a human look.
- Source and licence per dataset. Anything without a clear licence is flagged before commercial use.

---

## D. Dataset integration options

| Option | Effort now | ML correctness | Scales later | Verdict |
|---|---|---|---|---|
| **A. Local folder + scanner** | Very low | Good, *if* raw stays read-only and a manifest is generated | Yes, via a manifest `uri` that can point anywhere | **Use now** |
| B. ZIP import | Low | Same as A after extraction; adds a checksum of the archive | Moderate | Useful only as a thin wrapper (`import-zip` → extract to raw/ → scan). Not a separate system. |
| C. Admin upload UI | High (auth, storage, resumable uploads, moderation) | No better than A | Yes | **Not now.** It would pull training data through the public site. Revisit when non-engineers must add data. |
| D. Private Hugging Face dataset repo | Low–medium | Good: versioned by git commits, easy team sharing | Good | **Good P1 add-on** for sharing and backup across teammates' laptops. Check the licence before uploading third-party datasets. |
| E. Object storage (S3/R2) + DVC | Medium | Excellent reproducibility | Excellent | **Later (P3–P4)**, when data grows or several people train. R2 has no egress fees. |

## E. Recommended dataset workflow (for our stage)

```
RAW (read-only, never edited)        e.g. D:\kd-datasets\raw\<source_name>\...   (outside git)
   │  kd-ml audit      → dataset_audit/ report (problems listed, nothing fixed)
   │  kd-ml manifest   → manifest.parquet  (one row per image, checksums, sizes, phash)
   │  class_map.yaml   ← humans map raw folder names → canonical class IDs (reviewed in PR)
   │  kd-ml clean      → exclusions.csv (corrupt / duplicate / rejected, each with a reason) — images untouched
   │  kd-ml split      → split column assigned by group (see §11), test set frozen
   ▼
DATASET VERSION  = manifest + class_map + exclusions + split seed  → content hash, e.g. ds-2026.10-a1b2c3
   ▼
TRAINING reads only the manifest (never globs folders)
```

- Image bytes stay where they are. Git stores small text/parquet files: manifest, class map, exclusions, audit reports.
- Moving to R2/S3/HF later only changes the `uri` prefix. The loader uses `fsspec`, so the training code does not change.
- **One decision for you:** whether the ML code goes in `kisan-drishti/ml/` (one repo, simple) or a separate `kisan-drishti-ml` repo (cleaner deploys). The recommendation is `ml/` in this repo now, splitting later if needed.

## 8. Manifest design (the fields we actually need)

| Field | Why |
|---|---|
| `image_id` | sha256 of the file bytes: stable, dedupes, survives moves |
| `uri` | `file://D:/kd-datasets/raw/...` today, `r2://...` later |
| `source_dataset`, `source_path` | provenance back to the original folder/file |
| `raw_label` | original folder name (never overwritten) |
| `class_id` | canonical, e.g. `tomato.late_blight`, `tomato.healthy` (via `class_map.yaml`) |
| `crop` | derived from `class_id` |
| `is_healthy` | derived; lets us report healthy-vs-diseased metrics |
| `width`, `height`, `format`, `bytes` | quality checks and dataloader decisions |
| `phash` | near-duplicate detection |
| `group_id` | duplicate/near-duplicate cluster (and plant/field/session ID if the source has it) — splits are done **by group** |
| `split` | `train` / `val` / `test` / `excluded` |
| `exclude_reason` | corrupt, duplicate, label-conflict, off-topic… |
| `label_status` | `source` (as published) / `verified` (checked by our reviewer) |
| `license` | per source |

`class_map.yaml` (one per dataset version) holds, per `class_id`: crop, display name, is_healthy, source folder names, `knowledge_id` (link to `DiseaseInfo`) and a status (`train`, `merged-into:x`, `dropped:reason`).

---

## F. Model strategy options

| | A. One flat model (crop×disease) | B. Crop classifier → per-crop model | C. User picks crop → per-crop model | D. Shared model + crop as context |
|---|---|---|---|---|
| Accuracy potential | Good; shares features; can confuse similar diseases across crops | Errors compound (crop error ⇒ disease wrong) | Best per crop *if* each crop has enough data | Good; crop context removes cross-crop confusion |
| Data need | Pools everything, best for small classes | Needs crop labels (free) + enough per crop | Each model sees only its crop, so small crops suffer | Pools everything |
| Complexity | 1 model | 1 + 7 models | 7 models | 1 model (+ masking or a crop input) |
| Inference speed | 1 pass | 2 passes | 1 pass | 1 pass |
| Maintenance / adding crops | Retrain one model | Retrain crop model + add one | Add one model (isolated) | Retrain one model |
| Deployment cost | Lowest | Highest | 7 artefacts in memory | Lowest |
| UX | Needs no input | Needs no input | Farmer must pick (the app **already knows the farm's crop**) | Uses the farm's crop automatically |
| Error propagation | None | Yes | Wrong crop selection ⇒ wrong model | Mismatch is detectable (see below) |
| Imbalance | Global imbalance matters | Per-stage | Per-crop | Global, handled by loss weighting |

## G. Recommended model strategy: A trained, D at inference ("one model, crop-aware output")

- Train **one** classifier over all canonical `crop.disease` classes. This pools data, keeps one artefact and is cheap to serve.
- At inference, the crop comes from the farm context (the app already passes `ctx.crop`). The service **restricts the output to that crop's classes** and renormalises.
- It also reports the unrestricted top class. If the image looks strongly like a *different* crop, the result is `crop_mismatch` ("This looks like a tomato leaf, but your farm is wheat") instead of a forced wheat disease.
- If the farmer has no crop set, it falls back to plain strategy A.
- Why not B or C: seven small models multiply maintenance and cannot learn features shared across crops. Why not a learned crop-embedding (a "real" D): more complex, with no evidence yet that it beats masking.
- **Revisit after the audit.** If one crop's data is vastly larger or comes from a very different source (lab vs field), a per-crop head or model may win. The P1 experiments compare A+masking against per-crop models on the same splits.

## 10. Training approach: transfer learning (not from scratch)

From-scratch training needs far more images than typical crop-disease datasets hold. Fine-tune an ImageNet-pretrained backbone. Shortlist (final choice by P1 experiments):

| Backbone | Params (approx.) | CPU latency | Notes |
|---|---|---|---|
| MobileNetV3-Large | ~5 M | lowest | Mobile/web-friendly; accuracy ceiling lower |
| EfficientNet-B0 | ~5 M | low | Strong accuracy/size baseline; well supported by ONNX |
| ConvNeXt-Tiny | ~28 M | medium | Usually more robust to domain shift; heavier |
| ViT-S/16 or DeiT-S (e.g. DINOv2-S features) | ~22 M | medium | Strong with good pretraining; needs more augmentation |

Plan: EfficientNet-B0 first (baseline), then ConvNeXt-Tiny. Export the winner to **ONNX** and serve with `onnxruntime` on CPU. The same file can later run in-browser (onnxruntime-web) or on mobile. Training fits on this laptop's **RTX 4050 (6 GB)** with mixed precision at 224 px; Kaggle/Colab GPUs are the fallback. Tooling: PyTorch + `timm`, no heavy MLOps platform.

## 11. Data splitting (leakage-safe)

1. Deduplicate first: exact and near-duplicate clusters become one `group_id`.
2. If the source provides plant/field/session IDs or capture sequences (sequential file names, EXIF time bursts), those also define groups.
3. **Stratified group split** by `class_id`: no group spans two splits. Target roughly 70/15/15, adjusted for small classes (every class needs a minimum number of *groups* in test, otherwise it is flagged as "insufficient for evaluation").
4. If a dataset ships its own test split, check it for duplicates against train before trusting it.
5. **Test set frozen**: its IDs and hash are committed. It is used only for the final evaluation of a candidate, never for tuning, early stopping or threshold picking (use val for those).
6. **Separate field test set** (strongly recommended): a small set of real farm photos per crop, taken by us or partners. Lab-style datasets often overstate real-world accuracy; this set is our honest check.
7. Cross-source check: if a class exists in two sources, also report accuracy when training on one source and testing on the other.

## 12. Preprocessing and augmentation

**Validation (both workflows):** magic-byte type check (not the extension) → decode with Pillow → reject if corrupt, < 64 px, or extreme aspect ratio → apply EXIF orientation → convert to RGB → strip metadata.

**Inference preprocessing (deterministic, shared code with training eval):** resize the shorter side to 256 → centre crop 224 → normalise with the backbone's mean/std. Quality metrics are computed from the full image: blur (variance of Laplacian), brightness/exposure, leaf-pixel share.

**Training augmentations (train split only):**
- RandomResizedCrop (scale 0.6–1)
- Horizontal/vertical flips and 90° rotations. Leaves have no canonical orientation.
- Mild brightness/contrast/saturation jitter, which simulates sun, shade and phone cameras.
- **Very small hue shifts only.** Colour *is* the symptom (yellow stripes vs brown spots). Large hue jitter would turn chlorosis into healthy green, which is biologically wrong.
- Mild blur/JPEG-compression noise, for phone uploads.
- Optional background randomisation or random erasing, to fight the background shortcut.

No colour inversion, no heavy elastic warps, no synthetic "disease" painting.

## I. Evaluation strategy

On **val** (for tuning) and the frozen **test** set (once per candidate), plus the **field** and **OOD** sets:
- Per-class precision, recall, F1 and **support**, plus macro-F1 (the primary metric, so large classes cannot hide weak ones) and overall accuracy.
- A confusion matrix per crop, and a list of the most-confused pairs with example images.
- Healthy-vs-diseased recall per crop. Missing a disease (false "healthy") is worse than a false alarm.
- **Calibration:** temperature scaling fitted on val; report ECE and a reliability diagram before and after.
- **Selective prediction:** a risk–coverage curve. Pick the abstention threshold so the answered subset meets an agreed precision, and report the fraction answered.
- **OOD:** a set of non-leaf and unsupported images (soil, hands, animals, objects, other crops, blurred and dark photos). Report the rejection rate and false-accept rate.
- Bootstrap 95 % confidence intervals for the headline numbers.
- A **model card** per release: data version, metrics, known weak classes, intended use and limits.

No accuracy is promised in advance. Acceptance thresholds (e.g. minimum per-class recall, maximum OOD false-accept) are set by the team after the baseline (see Decisions).

## 14. Unknown / unsupported inputs

```
upload → (1) file checks: size, magic bytes, decodable, dimensions
       → (2) quality gate: blur, too dark/bright, too small leaf share   → status=poor_quality + how to retake
       → (3) "is this a plant leaf?" gate                                → status=unsupported
             v1: colour/leaf heuristic (exists today) + an OOD score from the model
             v2: small binary leaf/not-leaf model trained on our images + a negative set
       → (4) model → calibrated probabilities over the farm crop's classes
       → (5) crop-mismatch check (unrestricted top-1 is another crop with high prob) → status=crop_mismatch
       → (6) abstain if max calibrated prob < τ or margin(top1, top2) < m, or energy OOD score beyond the val-derived cutoff
             → status=uncertain: "Unable to determine reliably" + top candidates shown as possibilities, not answers
       → (7) status=ok: prediction + calibrated probability + alternatives
```

"Unknown disease not in our dataset" cannot be detected perfectly. The abstention thresholds and the OOD set reduce the risk, and the UI always says the classes are "from the diseases we can recognise for this crop" and to confirm with a KVK. Multiple plants or whole-field photos: the quality gate asks for one leaf close-up. v2 may crop leaves with a detector if needed.

## J. Production inference architecture

```
React (Disease page) ─► diseaseAnalysisService ─► remoteClassifier (DiseaseClassifier seam)
                                                      │ POST /v1/disease/analyze (multipart, ≤ 8 MB)
                                                      ▼
                             FastAPI inference service (Python, uvicorn, CPU)
                               validator → quality gate → preprocess → ONNX model
                               → temperature scaling → crop mask → abstention/OOD → JSON (no advice)
                                                      ▼
diseaseAnalysisService ◄── ModelResult  ─► maps class_id → DiseaseInfo (knowledge) ─► recsFor / Farm Advisor
                                                           + farm context (stage, weather risk, soil)
```

**Why FastAPI:** the model ecosystem (PyTorch/timm, onnxruntime, Pillow) is Python, and FastAPI gives typed request/response models, validation and OpenAPI for free.

**Alternatives considered:**
- A Node + onnxruntime-node sidecar. Workable, but it duplicates preprocessing in another language, and skew risk rises.
- In-browser onnxruntime-web: no server cost and no image leaves the device. But the model must download, it is slow on low-end phones, and there is no server-side validation or logging. It is a good *later* option for offline use.

The website never contains model logic. The recommendation engine stays in TypeScript/knowledge data.

## K. API design (proposal)

`POST /v1/disease/analyze`: `multipart/form-data`
- `image` (required; JPEG/PNG/WebP, ≤ 8 MB, ≤ 25 MP)
- `crop` (optional canonical crop ID; the app sends the farm's crop)
- `client_request_id` (optional, for idempotency and logs)
- `contribute` (optional bool, default **false**; consent to keep the image for review, used only when P4 exists)

`farmId` is **not** sent. The model does not need it, and joining with farm data happens in the app.

Response `200` (always structured; errors use their own codes):
```json
{
  "request_id": "…",
  "status": "ok | uncertain | crop_mismatch | unsupported | poor_quality",
  "model": { "id": "kd-disease", "version": "2026.10.0", "dataset": "ds-2026.10-a1b2c3", "config": "cfg-effb0-v3" },
  "input": { "crop_requested": "wheat", "crop_detected": "wheat", "width": 3024, "height": 4032 },
  "quality": { "ok": true, "blur": 212.4, "brightness": 0.52, "leaf_share": 0.61, "issues": [] },
  "prediction": { "class_id": "wheat.yellow_rust", "crop": "wheat", "is_healthy": false, "probability": 0.87, "calibrated": true },
  "alternatives": [ { "class_id": "wheat.leaf_rust", "probability": 0.08 } ],
  "decision": { "threshold": 0.6, "abstained": false, "reason": null },
  "warnings": [],
  "timing_ms": 140
}
```
- `prediction` is `null` unless `status` is `ok`. For `uncertain`, `alternatives` lists candidates only.
- Errors return `400 invalid_image`, `413 too_large`, `415 unsupported_type`, `429 rate_limited`, `503 model_unavailable` and `504 timeout`, each with a short `message` safe to show. No stack traces.
- `GET /v1/disease/model` returns the active model card: supported crops and classes, version, headline metrics and thresholds. The UI can show "Supports: …".
- `GET /health` (liveness) and `GET /ready` (model loaded).
- Later (P4): `POST /v1/disease/feedback` `{request_id, farmer_label?, correct: bool}`, stored only with consent.

The frontend maps the response into an extended `ClassifierPrediction` (adds `status`, `quality`, `modelVersion`). **Advice is added only by `diseaseAnalysisService` → knowledge → recommendation engine.**

## 17. Farmer image storage and privacy

- Default: **process in memory and do not store.** No image bytes are logged. Logs keep request ID, timing, status, class and probability only.
- With explicit `contribute=true` consent, the image goes to a **separate review bucket**, never to the training data. That bucket needs its own retention period and a deletion path.
- Contributions reach training only through **expert verification → curated dataset version → retrain → evaluation → human approval**.
- There is never automatic retraining from uploads.
- EXIF (including GPS) is stripped on receipt.

## 18 / M. Versioning and MLOps (lightweight)

- **Dataset version** `ds-YYYY.MM-<hash>`: the hash of manifest + class_map + exclusions + split seed, with the files committed in git.
- **Config version** `cfg-<name>-vN`: a YAML file of backbone, image size, augmentations, optimiser and epochs, committed.
- **Model version** `kd-disease YYYY.MM.patch`. The artefact bundle is `model.onnx`, `classes.json`, `calibration.json` (temperature, thresholds), `model_card.md` and `metrics.json`, plus the git commit, dataset version and config version.
- **Registry v1** is a folder or R2/HF path per version plus a `REGISTRY.md` table. MLflow or W&B only if we find we need them.
- Every API response carries `model.version` + `dataset`. Saved scans in the app store them too, so we can always answer "which data and code produced this result?".
- **Release rule:** a new model ships only after it beats or matches the current one on the frozen test, field and OOD sets, the model card is reviewed and a human approves. Rollback means pointing the service to the previous bundle.

## L. Deployment plan

| Stage | Where | Notes |
|---|---|---|
| Development | Laptop: `uvicorn` + the Vite dev server with `VITE_DISEASE_MODEL=remote`, `VITE_API_BASE=http://localhost:8000` | GPU only for training; inference on CPU as in production |
| Staging | Small CPU container service (Render web service, Railway or Google Cloud Run) | Same Docker image as production; synthetic smoke tests plus the OOD set |
| Production | Same, with ≥ 1 warm instance (to avoid cold starts during demos), health checks and autoscaling | Add the origin to CSP `connect-src` and CORS allow-list the site origin only |

A small ONNX CNN at 224 px is expected to run in the low hundreds of milliseconds on a shared CPU. This will be **measured in P1**, not assumed. A GPU host is not justified unless measurements say so. Cloud Run's scale-to-zero is the cheapest option but has cold starts; Render/Railway are simplest with our existing Render setup.

## N. Security and failure handling

- **Upload:** size cap (enforced both before reading and during streaming), magic-byte type check, Pillow decode inside a try block with a decompression-bomb limit (`Image.MAX_IMAGE_PIXELS`), re-encode before processing, strip EXIF, and never trust the filename or `Content-Type`.
- **Abuse:** per-IP (and later per-user) rate limit, request timeout (e.g. 10 s), one inference worker pool with a bounded queue (`429`/`503` when full), and CORS restricted to the site.
- **Auth:** once Supabase is on, the API verifies the user's JWT (anonymous demo users allowed, with a lower rate limit).
- **Model failures:** the model loads at startup. `/ready` stays false until it has loaded and passed a self-test image. A load failure keeps the old version.
- **Failures in the app:** the existing UI shows "Analysis unavailable, try again" and never falls back to the demo classifier silently. The demo samples stay clearly labelled.
- **Observability:** structured logs (no images), latency percentiles, status mix (ok, uncertain, unsupported), class distribution drift, and error rate. Alerts on readiness and error spikes.

---

## O. Implementation phases

### P0: Required before training
- **Goal:** know exactly what data we have, and make it reproducible and leakage-safe.
- **Files/modules:** new `ml/` project (`pyproject.toml`, `kd_ml/audit.py`, `manifest.py`, `dedupe.py`, `split.py`, `class_map.yaml`), `ml/datasets/<version>/` (manifest, exclusions, audit report), `docs/`.
- **Built:** a read-only audit, manifest, dedupe groups and group-stratified split with a frozen test set. Plus a knowledge gap list (classes without a verified `DiseaseInfo`).
- **Output:** audit report (sections B/C filled in with real numbers), `ds-…` version, class map for team review.
- **Verify:** the audit runs twice with identical hashes, and raw files are unchanged (checksums before and after). No group crosses splits (automated test). The team signs off on the class map.

### P1: First real model
- **Goal:** a measured baseline, not a demo.
- **Files:** `ml/kd_ml/train.py`, `eval.py`, `calibrate.py`, `export_onnx.py`, `configs/*.yaml`, `ml/models/<version>/` (bundle, git-ignored or in HF/R2).
- **Built:** EfficientNet-B0 and ConvNeXt-Tiny fine-tunes, A+masking vs per-crop comparison, temperature scaling, thresholds, OOD set evaluation, model card.
- **Output:** the chosen model bundle + `metrics.json` + model card with per-class results and known weaknesses.
- **Verify:** metrics are recomputed from the saved ONNX file (not the training process). Outputs match between PyTorch and ONNX within tolerance. CPU latency is measured. The field-set results are reviewed by the team and an agronomist.

### P2: Website integration
- **Goal:** real predictions in the Disease page through the existing seam.
- **Files:** `services/inference/` (FastAPI app), `src/models/disease.ts` (extended contract), `src/services/disease/classifiers.ts` (multipart `remoteClassifier` + status mapping), `src/services/diseaseAnalysisService.ts`, `src/pages/app/Disease.tsx` (uncertain/unsupported/mismatch states, model version), `src/data/crops.json` + `diseases.json` (verified entries), risk engine keyed by class ID.
- **Output:** end-to-end analysis locally, with honest states.
- **Verify:** contract tests (JSON schema) on both sides. A headless UI run over a fixed image set covering every status. The demo classifier is still labelled and never used silently.

### P3: Production deployment
- **Goal:** a reliable hosted inference service.
- **Files:** `services/inference/Dockerfile`, Render/Railway/Cloud Run service config, CSP `connect-src` and CORS, `.env.example` (`VITE_API_BASE`), README.
- **Output:** staging, then production URLs, with the model version visible in the UI.
- **Verify:** smoke tests on staging (valid, oversized, corrupt, non-image and OOD images). Load test at expected demo traffic. Rollback rehearsal.

### P4: Monitoring and improvement
- **Goal:** learn from real use without compromising privacy or quality.
- **Files:** feedback endpoint + consent UI, review queue (separate storage), dashboards/alerts, dataset versioning with DVC or HF if data volume warrants it.
- **Output:** a curated, verified contribution flow and periodic re-evaluation reports.
- **Verify:** no image is stored without consent (tested). Every new model passes the release rule in §M before it ships.

---

## Simple explanation

```
Our photos of sick and healthy leaves (kept untouched as the "originals")
     ↓  list every photo in a spreadsheet: which crop, which disease, where it came from
     ↓  throw out broken photos and copies (on paper only — originals untouched)
     ↓  put some photos in a locked box (the "test" box) that the AI never studies
     ↓  teach an AI that already knows how to see (pretrained) to recognise our diseases
     ↓  exam: test it on the locked box + real farm photos; count right/wrong per disease
     ↓  teach it to say "I'm not sure" when it isn't
     ↓  save the trained "brain" with a label: which photos + which settings made it
     ↓  put the brain on a small server
Farmer's photo → website → server checks the photo → brain gives its best guess + how sure it is
     ↓
Kisan Drishti (not the brain) explains what it means for this farm, using checked farming knowledge
```

The AI only answers "which disease does this look like, and how sure am I". The advice comes from our verified knowledge plus the farm's crop, stage, weather and soil. When the AI isn't sure, we say so.

---

## Recommended architecture

```
                 TRAINING (offline, team only)                         SERVING (online)
RAW images (read-only) ─► audit ─► manifest + class map ─►     React UI
   ─► group split (frozen test) ─► train (timm, GPU)             │ diseaseAnalysisService (TS)
   ─► calibrate ─► evaluate (test + field + OOD) ─► model card   │   └ remoteClassifier ── POST /v1/disease/analyze
   ─► ONNX bundle (versioned) ─► human approval ──────────────►  FastAPI (CPU): validate → quality → ONNX → calibrate
                                                                  → crop mask → abstain → JSON (evidence only)
                                                                 │
                                                  knowledge (verified DiseaseInfo) + farm context
                                                                 ▼
                                                  Recommendation engine / Farm Advisor → farmer
```

## Decisions we need you to approve

1. **Dataset location.** Where are the datasets? Give the path or drive. Can the audit read them there (read-only)?
2. **Raw storage.** Keep raw images on local disk now (e.g. `D:\kd-datasets\raw`), with manifests in git.
3. **Repo layout.** ML code in `kisan-drishti/ml/` and the inference service in `kisan-drishti/services/inference/`, or a separate repo.
4. **Team sharing.** Private Hugging Face dataset repo now, or later. This depends on the source licences.
5. **Class map ownership.** Who reviews and approves the canonical class list and merges or drops of ambiguous classes?
6. **Model strategy.** One model over all classes, restricted at inference to the farm's crop (A trained, D served), with a per-crop comparison in P1.
7. **Backbone shortlist.** EfficientNet-B0 baseline, ConvNeXt-Tiny challenger, ONNX export, CPU serving.
8. **Split policy.** Group-stratified ~70/15/15 after deduplication, with a frozen test set.
9. **Field test set.** Commit to collecting a small set of real farm photos per crop. Who collects them, and roughly how many?
10. **Acceptance gate.** The metric thresholds a model must meet to ship (to be set after the P1 baseline): minimum per-class recall, maximum OOD false-accept, calibration error.
11. **Abstention behaviour.** Show top candidates when the model is "uncertain", or show only "unable to determine".
12. **Crop catalogue change.** Add cotton, groundnut, pea and tomato to the app. Keep or hide rice, chickpea and mustard, which have no image data.
13. **Knowledge sourcing.** Who writes and verifies `DiseaseInfo` guidance per class, and from which sources (ICAR/KVK/state agri-university)?
14. **API contract change.** Move from JSON base64 of the browser's 224 px image to a multipart upload of the original photo, with preprocessing on the server.
15. **Privacy default.** No image retention, and contributions only with opt-in consent to a separate review queue.
16. **Hosting.** Render (next to the static site), Railway or Cloud Run for the CPU inference service, and whether to keep one warm instance.
17. **Auth on the API.** Require a Supabase JWT (Demo users allowed but rate-limited), or leave the API public with an IP rate limit for the SIH phase.

**Stopping here.** Implementation begins only after: *"Architecture approved. Begin P0."*
