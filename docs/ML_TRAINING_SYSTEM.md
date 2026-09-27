# Kisan Drishti — Disease Model Training & Management System

Status (26 Sep 2026): **implemented as an MVP**. It has been tested end to end with a small *synthetic* test
fixture only. **No real crop-disease model exists yet.** The first real model will come from the dataset you
upload. Nothing in this system downloads or uses a public dataset.

```
YOUR DATASET (.zip)
  → safe ingestion + provenance record        (dataset version, immutable)
  → validation report (real counts, warnings)
  → train / validation / test split           (your folders, or stratified + seeded)
  → background training job (PyTorch, GPU/CPU) → live progress, epoch history
  → best checkpoint → test-set evaluation     (accuracy, P/R/F1, confusion matrix)
  → versioned model artefact + registry       (lineage: dataset → split → job → model)
  → admin deployment (permission gate, rollback)
  → farmer Disease page → /v1/disease/predict → class + confidence + top-3
  → uncertainty threshold → knowledge layer (advice only for verified classes)
```

---

## 1. What existed before, and what was added

| | Before | Added |
|---|---|---|
| Frontend | React 19 + Vite 6 + Tailwind, service layer, `DiseaseClassifier` seam (`demo` / `remote`) | Admin area `/app/admin/ml/*`, real `remoteClassifier`, trained-model states on the Disease page |
| Backend | **None** (Render static site) | `backend/`: FastAPI API + separate training worker process |
| Database | None (browser storage only) | SQLite metadata DB (`backend/storage/kisan_ml.sqlite3`) |
| Auth | Demo Login (browser-only) or Supabase | Server-enforced ML-admin auth: admin keys → signed sessions, or Supabase JWT + allow-list/role |
| Disease model | `demoClassifier`: sample labels with *simulated* scores; real photos → "unidentified" | Real inference with the deployed model; the demo classifier is still the default when `VITE_DISEASE_MODEL` is unset |

Framework choice: **PyTorch + torchvision**. It trains on your RTX 4050 with CUDA, serves on CPU, offers the
three candidate backbones with ImageNet weights, and loads weights safely with `weights_only=True`. There is one ML
framework only, and no extra MLOps platform.

## 2. Architecture

```
React (Vite)                         FastAPI (backend/kd_backend/api)            Worker process (kd_backend/worker.py)
─────────────                        ───────────────────────────────             ────────────────────────────────────
Disease page ── POST image ────────► /v1/disease/predict ─► inference.py         claims queued work (atomic UPDATE):
  remoteClassifier                     active model resolver (model_deployments)   · dataset ingestion + validation
  diseaseAnalysisService               cached model, shared preprocessing           · training → evaluation → artefact
  knowledge (diseases.json + class map)                                           writes progress/epochs to SQLite
AI Model Training (admin) ── bearer ► /v1/admin/* (require_admin on every route)  heartbeat → "worker online" in UI
                                        datasets · training · models · deployment
                                              │                         │
                                        SQLite metadata            storage/ (datasets, models, checkpoints, evaluations, temp)
```

- **Training never runs in an HTTP request.** `POST /v1/admin/training/jobs` creates a record and returns immediately. The worker trains, and the UI polls every 2 s while a job runs.
- **Worker startup:** by default the API starts one worker (`ML_WORKER_AUTOSTART=true`) and a supervisor restarts it if no live heartbeat is seen. For a separate GPU machine, set `ML_WORKER_AUTOSTART=false` on the web server and run `python -m kd_backend.worker` where the GPU is (it needs the same storage folder and database).
- **Swappable pieces:** paths go through `storage.py` (relative paths in the DB), SQL is plain with stable text IDs (Postgres-ready), and the job queue is a DB table (replaceable by Redis/Celery).

## 3. Database (SQLite, `kd_backend/db.py`)

| Table | Purpose |
|---|---|
| `datasets` | Dataset name/description |
| `dataset_versions` | One uploaded archive: **provenance** (source, owner, licence, permission status, collection method, notes, uploader, date, original filename, archive SHA-256), status, counts, content hash, full validation report, `locked_at` |
| `dataset_classes` | Discovered classes: raw folder name + display name + count |
| `dataset_splits` | Append-only splits: strategy, percentages, seed, counts per class, manifest path + SHA-256 |
| `training_jobs` | Config, lifecycle status, live progress, device, errors, cancel request (who/when) |
| `training_epochs` | Per-epoch train/val loss + accuracy, val macro-F1, LR, duration, best flag |
| `models` | Version, lineage FKs (dataset version, split, job), architecture, classes, preprocessing, config, all test metrics, full evaluation, artefact path/SHA-256/size |
| `model_deployments` | Deploy/rollback history, active flag, **permission override (who, when, reason)** |
| `prediction_logs` | Model, predicted class, confidence, uncertain flag, threshold, inference time. **No images.** A `feedback` column is reserved for later |
| `audit_log` | Every admin action (upload, provenance change, split, training start/cancel, deploy, rollback, override, archive, delete, export, sign-in failures) |
| `settings` | Admin-editable confidence threshold |
| `worker_heartbeat` | Which worker is online, on which device |

## 4. Installation

```bash
cd backend
python -m venv .venv
.venv\Scripts\python -m pip install -r requirements-dev.txt
.venv\Scripts\python -m pip install -r requirements-ml.txt --index-url https://download.pytorch.org/whl/cu126
copy .env.example .env
```
Use `--index-url https://download.pytorch.org/whl/cpu` instead on machines without an NVIDIA GPU.

Put at least one admin in `backend/.env` (never commit it):
```
ML_ADMIN_KEYS=yourname:<output of: python -c "import secrets; print(secrets.token_urlsafe(32))">
```
On this laptop, `backend/.env` already exists with a generated key for the admin `admin`. **Read it from that file.**

Frontend (`.env.local` in the project root, already created on this laptop):
```
VITE_API_BASE=http://127.0.0.1:8000
VITE_DISEASE_MODEL=remote
```

Run:
```bash
cd backend && .venv\Scripts\python -m uvicorn kd_backend.api.app:app --port 8000
npm run dev          # site on http://localhost:5240
```
(or the `kisan-drishti-ml` launch configuration). The API starts the training worker automatically.

Tests: `cd backend && .venv\Scripts\python -m pytest` (49 tests, including real CPU training on the synthetic fixture).

## 5. Uploading your dataset

Open **/app/admin/ml** → sign in with your admin key → **Datasets & validation → Upload dataset**.

- **Format A:** `train/`, `validation/` (or `val/`, `valid/`), `test/`, each with one folder per class. This split is used exactly as given.
- **Format B:** one folder per class at the top (e.g. `Tomato___Early_blight/`). You generate the split after validation.
- A single wrapper folder (e.g. `dataset/`) is fine. Class names are the folder names; nothing is hard-coded.
- Images: JPG, PNG, WebP, BMP (checked by content, not extension). ZIP only.
- You must fill in source, owner and licence (write "Unknown" if unknown), choose a permission status, and confirm them. The system never assumes rights.

**Safety checks.** Uploads stream to disk with a size cap (default 8 GB). The whole archive is rejected for absolute paths, `..`, symlinks, a suspicious compression ratio, too many files or too large when expanded. Hidden/system files, scripts and executables are skipped and reported. File names from the ZIP are never used on disk. Every image is fully decoded; corrupt ones are excluded.

**Validation report (real numbers).** It shows images per class and per split, dimensions (min/max/common), formats, corrupt, excluded and ignored files, and empty classes. It also flags class imbalance (with the actual counts), classes under 30 images, and duplicates:
- exact duplicates by SHA-256;
- near-identical images by 64-bit dHash, Hamming distance ≤ 2. Clusters over 8 images are reported but not grouped, because they are usually many different photos on one background.

Status is one of Not validated / Validating / Ready / Ready with warnings / Invalid. No quality "score" is shown.

**Splits.** The default is 70 / 15 / 15 with seed 42, and the percentages must add up to 100. Splitting is stratified by class, and exact or near-identical copies are always kept in the same partition. The same seed gives the same split, and each split stores its manifest and SHA-256.

**Immutability.** Images are never changed after ingestion. A dataset version is locked when training first uses it, and locked versions cannot be deleted. New or changed images mean a new version (v1.1). Provenance fields stay editable, and every change is audited.

## 6. Training

**Training → New training run**: choose the dataset version, split, model version and architecture, then the settings.
- **Model version:** a version is suggested (minor bump if the class set and architecture are unchanged, major bump if not). You can edit it.
- **Architecture:** EfficientNet-B0 (default), MobileNetV3-Large (fastest on CPU and phones), ResNet-18 or ResNet-50.
- **Settings:** epochs, batch size, learning rate, image size, early stopping (patience), augmentation, ImageNet-pretrained weights and seed. Advanced settings cover weight decay, LR schedule, label smoothing, class-weighted loss, backbone freezing, mixed precision, device and data-loader workers. All are validated on the server.

**What happens:**
- **Transfer learning:** a new classification head on an ImageNet-pretrained backbone, trained with AdamW.
- **Augmentation (training images only):** crops/zoom 0.7–1.0, flips, ±20° rotation, ±20 % brightness/contrast, ±10 % saturation, and hue only ±0.02 because colour *is* the symptom.
- **Each epoch:** training → validation. The checkpoint with the lowest validation loss is kept, and early stopping ends the run once validation loss has not improved for `patience` epochs.
- **At the end:** the best checkpoint is evaluated once on the held-out test set.
- **Cancel** is cooperative: the job becomes `cancel_requested`, the worker stops at the next batch, removes its checkpoints and marks the job `cancelled`.
- **Failures** are stored with safe messages (server paths redacted): out of GPU memory, loss diverged, pretrained weights unavailable, data errors, and worker stopped. A failed job never shows as completed.

**GPU.** `TRAINING_DEVICE=auto` uses CUDA when available. Verified here on the RTX 4050 (CUDA 12.6, mixed precision, 2 data-loader workers). The first run with pretrained weights downloads them once from download.pytorch.org into `storage/weights/`. To train elsewhere, install the matching PyTorch build and run the worker on that machine against the same storage and database.

## 7. Evaluation

Computed from the test predictions of the best checkpoint (numpy, `ml/metrics.py`):
- test accuracy and top-3 accuracy;
- **macro** precision/recall/F1 (every class counts equally) and **weighted** precision/recall/F1 (by test images per class);
- per-class precision/recall/F1, support and "predicted as";
- the confusion matrix (rows = true class) and a list of the most common confusions.

Classes with no test images, or never predicted, are flagged instead of being hidden.

## 8. Model storage and export

`storage/models/<model_id>/` contains:
- `model.pt`: weights only;
- `manifest.json`: classes and mapping, preprocessing contract, augmentation, full training config, dataset version, split, seed and content hash, metrics, library versions, weights SHA-256 and a reproducibility note;
- `metrics.json`: the evaluation.

Test predictions are in `storage/evaluations/<model_id>/`. **Export** downloads the three files as a ZIP. `storage/` is git-ignored.

## 9. Deployment and rollback

**Deployment**: deploy any Ready model.
- The model is loaded and checksum-verified before the switch; if loading fails, nothing changes.
- One model is active at a time; the previous deployment is marked superseded.
- If the training dataset's permission is **Permission required** or **Unknown**, deployment is blocked. You can override only by ticking an explicit confirmation and writing a reason. The server stores who, when and why on the deployment and in the audit log. Fixing the dataset's provenance record removes the block.

**Rollback** re-activates the previous model (or any earlier deployment) without retraining. **Turn off** removes the production model; farmers then see "temporarily unavailable". The confidence threshold (default 65 %) is set on the same page.

Deployed models cannot be archived or deleted. Models that were ever deployed can be archived, but not deleted, so rollback history stays valid.

## 10. How the farmer Disease page uses the model

1. The browser checks the file (type, size, and that a leaf is visible, by colour share) and **sends the original photo** to `POST /v1/disease/predict`.
2. The server validates it (content type, pixel limit, decode) and resolves the active deployment. It uses the cached model (reloaded when the deployment changes) and applies the **model's own saved preprocessing**: EXIF orientation, RGB, resize shorter side, centre crop, ImageNet normalisation.
3. The response has the class ID, display name, confidence, top-3 probabilities, threshold, model version, dataset version and inference time. The image is processed in memory and **never stored**.
4. **Below the threshold**, the page says "Unable to identify this condition reliably", shows the possible match with its confidence, and advises a clearer photo or an expert. It never states a diagnosis.
5. **Advice comes only from verified knowledge.** `src/data/disease-class-map.json` maps model class IDs to entries in `diseases.json`. **It is empty on purpose.** Until someone verifies a mapping, the page shows the prediction but no advice: "no verified guidance yet — consult KVK". A class that looks like a different crop than the farm's triggers a warning instead of advice.
6. With no deployed model, the page shows "Disease identification is temporarily unavailable because no trained model is currently deployed". It never falls back to demo output.

## 11. Environment variables

**Backend (`backend/.env`):**
- `ML_STORAGE_PATH`, `DATASET_STORAGE_PATH`, `MODEL_STORAGE_PATH`, `CHECKPOINT_STORAGE_PATH`, `EVALUATION_STORAGE_PATH`, `TEMP_STORAGE_PATH`, `PRETRAINED_WEIGHTS_PATH`, `ML_DATABASE_PATH`
- `ML_ADMIN_KEYS`, `ML_SESSION_SECRET`, `ML_ADMIN_SESSION_HOURS`, `SUPABASE_URL`, `SUPABASE_JWT_SECRET`, `ML_ADMIN_EMAILS`, `ML_ADMIN_USER_IDS`
- `MAX_DATASET_UPLOAD_SIZE`, `MAX_DATASET_UNCOMPRESSED_SIZE`, `MAX_DATASET_FILES`, `MAX_COMPRESSION_RATIO`, `MAX_IMAGE_PIXELS`, `MIN_IMAGES_PER_CLASS_WARNING`, `STALE_UPLOAD_HOURS`, `KEEP_UPLOAD_ARCHIVES`
- `TRAINING_DEVICE`, `TRAINING_NUM_WORKERS`, `ML_WORKER_AUTOSTART`, `ML_WORKER_POLL_SECONDS`
- `INFERENCE_DEVICE`, `MODEL_CONFIDENCE_THRESHOLD`, `MAX_PREDICT_IMAGE_SIZE`, `PREDICT_RATE_LIMIT_PER_MIN`, `CORS_ORIGINS`

See `backend/.env.example` for defaults.

**Frontend:** `VITE_API_BASE`, `VITE_DISEASE_MODEL=remote`.

## 12. Security summary

- Every `/v1/admin` route is checked on the server; the only public routes are `/health`, `/v1/disease/model` and `/v1/disease/predict`. This is tested.
- Admin sessions are HMAC-signed with an expiry. Removing a key ends its sessions, and failed sign-ins are rate-limited and audited.
- Supabase tokens are signature-verified. Admin rights come from `app_metadata` (settable only with the service role) or the allow-list, never from `user_metadata`, and anonymous users are refused.
- Upload and ZIP protections are listed in §5. Predict requests are size-capped, decoded with a pixel limit and rate-limited per IP.
- Weights are loaded with `torch.load(weights_only=True)`, so no pickled code can execute. No endpoint accepts a file path.
- Error bodies are `{error:{code,message}}` with no stack traces. Training error messages have server paths redacted.
- CORS is limited to `CORS_ORIGINS`, and bearer tokens are used instead of cookies (no CSRF surface). The CSP `connect-src` gets the `VITE_API_BASE` origin automatically for `vite preview`; **add it to `render.yaml` by hand** when you deploy.

## 13. MVP limitations (not hidden)

- **No real model yet.** Everything was verified with a synthetic fixture only. The admin screens were built and type-checked, and their API is tested, but a visual pass signed in as an admin was not done by the developer.
- **Single machine by design:** SQLite, local disk, one worker, in-process rate limits and model cache per API process. Multi-machine needs Postgres, object storage (S3/R2) and a real queue.
- **Uploads** are a single streamed request (no resumable upload). Very large archives on slow links may need a retry.
- **Uncertainty** is a softmax-confidence threshold only. It is not calibrated and not out-of-distribution detection: unknown diseases, non-leaf images or other crops can still get high confidence. Temperature scaling and an OOD set are the next steps.
- **Leakage:** duplicate detection is exact plus near-identical only. It does not know plant/field/session groups, and lab-style datasets can overstate field accuracy, so a separate field test set is still recommended.
- **Reproducibility:** splits and config are exact, and training is seeded, but results are not bit-identical across GPUs or library versions.
- **Advice:** the class → knowledge map is empty until someone verifies entries, so a real model will show predictions without treatment advice at first. This is intentional.
- **Feedback loop:** `prediction_logs.feedback` exists, but there is no feedback UI or review queue yet. Retraining from feedback must go through human review and a new dataset version.
- **Deployment of the backend:** `render.yaml` still deploys only the static site. A hosted API and worker (and a GPU host for training) need to be set up separately.
