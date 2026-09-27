"""
Runtime configuration, read once from environment variables (and an optional backend/.env file).

Nothing here is machine-specific: every path defaults to a folder inside backend/storage and can
be moved with ML_STORAGE_PATH (or the more specific *_STORAGE_PATH variables). Secrets (admin keys,
session secret, Supabase JWT secret) are only ever read from the environment — never committed.
"""
from __future__ import annotations

import os
import secrets
from dataclasses import dataclass, field
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent


def _load_dotenv(path: Path) -> None:
    """Minimal KEY=VALUE loader so local development needs no extra dependency. Real env wins."""
    if not path.is_file():
        return
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key, value = key.strip(), value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


def _bool(name: str, default: bool) -> bool:
    v = os.environ.get(name)
    if v is None or v.strip() == "":
        return default
    return v.strip().lower() in {"1", "true", "yes", "on"}


def _int(name: str, default: int) -> int:
    v = os.environ.get(name, "").strip()
    return int(v) if v else default


def _float(name: str, default: float) -> float:
    v = os.environ.get(name, "").strip()
    return float(v) if v else default


def _path(name: str, default: Path) -> Path:
    v = os.environ.get(name, "").strip()
    p = Path(v) if v else default
    return (p if p.is_absolute() else (BACKEND_DIR / p)).resolve()


def _admin_keys(raw: str) -> dict[str, str]:
    """ML_ADMIN_KEYS="alice:long-random-key,bob:another-key" → {key: name}. Short keys are refused."""
    out: dict[str, str] = {}
    for part in (raw or "").split(","):
        part = part.strip()
        if not part or ":" not in part:
            continue
        name, _, key = part.partition(":")
        name, key = name.strip(), key.strip()
        if name and len(key) >= 24:
            out[key] = name[:60]
    return out


@dataclass
class Settings:
    storage_root: Path
    datasets_dir: Path
    models_dir: Path
    checkpoints_dir: Path
    evaluations_dir: Path
    temp_dir: Path
    weights_dir: Path
    db_path: Path

    # Upload / ingestion limits
    max_upload_bytes: int
    max_uncompressed_bytes: int
    max_archive_members: int
    max_compression_ratio: float
    max_image_pixels: int
    min_images_per_class_warning: int
    stale_upload_hours: int
    keep_upload_archives: bool

    # Training
    training_device: str  # auto | cuda | cpu
    training_num_workers: int
    worker_autostart: bool
    worker_poll_seconds: float

    # Inference
    inference_device: str
    default_confidence_threshold: float
    max_predict_bytes: int
    predict_rate_limit_per_min: int

    # Auth
    admin_keys: dict[str, str]
    session_secret: bytes
    session_hours: float
    supabase_url: str
    supabase_jwt_secret: str
    supabase_admin_emails: set[str]
    supabase_admin_ids: set[str]

    cors_origins: list[str] = field(default_factory=list)


def load_settings() -> Settings:
    _load_dotenv(BACKEND_DIR / ".env")
    root = _path("ML_STORAGE_PATH", BACKEND_DIR / "storage")
    s = Settings(
        storage_root=root,
        datasets_dir=_path("DATASET_STORAGE_PATH", root / "datasets"),
        models_dir=_path("MODEL_STORAGE_PATH", root / "models"),
        checkpoints_dir=_path("CHECKPOINT_STORAGE_PATH", root / "checkpoints"),
        evaluations_dir=_path("EVALUATION_STORAGE_PATH", root / "evaluations"),
        temp_dir=_path("TEMP_STORAGE_PATH", root / "temp"),
        weights_dir=_path("PRETRAINED_WEIGHTS_PATH", root / "weights"),
        db_path=_path("ML_DATABASE_PATH", root / "kisan_ml.sqlite3"),
        max_upload_bytes=_int("MAX_DATASET_UPLOAD_SIZE", 8 * 1024**3),
        max_uncompressed_bytes=_int("MAX_DATASET_UNCOMPRESSED_SIZE", 20 * 1024**3),
        max_archive_members=_int("MAX_DATASET_FILES", 400_000),
        max_compression_ratio=_float("MAX_COMPRESSION_RATIO", 100.0),
        max_image_pixels=_int("MAX_IMAGE_PIXELS", 40_000_000),
        min_images_per_class_warning=_int("MIN_IMAGES_PER_CLASS_WARNING", 30),
        stale_upload_hours=_int("STALE_UPLOAD_HOURS", 24),
        keep_upload_archives=_bool("KEEP_UPLOAD_ARCHIVES", False),
        training_device=os.environ.get("TRAINING_DEVICE", "auto").strip().lower() or "auto",
        training_num_workers=_int("TRAINING_NUM_WORKERS", 2),
        worker_autostart=_bool("ML_WORKER_AUTOSTART", True),
        worker_poll_seconds=_float("ML_WORKER_POLL_SECONDS", 2.0),
        inference_device=os.environ.get("INFERENCE_DEVICE", "cpu").strip().lower() or "cpu",
        default_confidence_threshold=_float("MODEL_CONFIDENCE_THRESHOLD", 0.65),
        max_predict_bytes=_int("MAX_PREDICT_IMAGE_SIZE", 8 * 1024**2),
        predict_rate_limit_per_min=_int("PREDICT_RATE_LIMIT_PER_MIN", 30),
        admin_keys=_admin_keys(os.environ.get("ML_ADMIN_KEYS", "")),
        session_secret=b"",
        session_hours=_float("ML_ADMIN_SESSION_HOURS", 8.0),
        supabase_url=os.environ.get("SUPABASE_URL", "").strip().rstrip("/"),
        supabase_jwt_secret=os.environ.get("SUPABASE_JWT_SECRET", "").strip(),
        supabase_admin_emails={e.strip().lower() for e in os.environ.get("ML_ADMIN_EMAILS", "").split(",") if e.strip()},
        supabase_admin_ids={e.strip() for e in os.environ.get("ML_ADMIN_USER_IDS", "").split(",") if e.strip()},
        cors_origins=[o.strip() for o in os.environ.get("CORS_ORIGINS", "http://localhost:5240,http://127.0.0.1:5240,http://localhost:5241").split(",") if o.strip()],
    )
    for d in (s.storage_root, s.datasets_dir, s.models_dir, s.checkpoints_dir, s.evaluations_dir, s.temp_dir, s.weights_dir, s.db_path.parent):
        d.mkdir(parents=True, exist_ok=True)
    s.session_secret = _session_secret(s.storage_root)
    return s


def _session_secret(root: Path) -> bytes:
    """ML_SESSION_SECRET if set; otherwise a random secret generated once and kept in storage (never in git)."""
    env = os.environ.get("ML_SESSION_SECRET", "").strip()
    if env:
        return env.encode()
    f = root / ".session_secret"
    if f.is_file():
        return f.read_bytes().strip()
    value = secrets.token_hex(32).encode()
    f.write_bytes(value)
    try:
        os.chmod(f, 0o600)
    except OSError:
        pass
    return value


_settings: Settings | None = None


def get_settings() -> Settings:
    global _settings
    if _settings is None:
        _settings = load_settings()
    return _settings


def reset_settings() -> None:
    """Tests change environment variables and call this to re-read them."""
    global _settings
    _settings = None
