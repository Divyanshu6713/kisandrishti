"""
Kisan Drishti ML API (FastAPI).

    Public (farmer-facing, rate-limited, no training controls):
        GET  /health
        GET  /v1/disease/model        active model card (or {"deployed": false})
        POST /v1/disease/predict      raw image body (image/jpeg|png|webp) → prediction

    Admin (every route requires an authenticated ML administrator — see security.py):
        /v1/admin/...                 datasets, training, models, deployment, settings, audit

Run:  uvicorn kd_backend.api.app:app --port 8000     (from the backend/ folder)
"""
from __future__ import annotations

import atexit
import logging
import subprocess
import sys
import threading
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from .. import inference
from ..config import BACKEND_DIR, get_settings
from ..db import init_db
from ..errors import AppError
from ..security import RateLimiter
from .admin import router as admin_router
from .util import client_ip, read_body_limited

log = logging.getLogger("kd.api")
_worker: subprocess.Popen | None = None
_supervisor_stop = threading.Event()
SUPERVISE_S = 15


def _start_worker() -> None:
    """Dev convenience: start one background worker if none is alive (ML_WORKER_AUTOSTART=true)."""
    global _worker
    from ..worker import other_live_workers

    if _worker is not None and _worker.poll() is None:
        return
    if other_live_workers():
        return
    flags = subprocess.CREATE_NEW_PROCESS_GROUP if sys.platform == "win32" else 0
    _worker = subprocess.Popen([sys.executable, "-m", "kd_backend.worker"], cwd=str(BACKEND_DIR), creationflags=flags)
    log.info("Started training worker (pid %s)", _worker.pid)


def _supervise() -> None:
    """
    Keeps one worker alive. A worker reported by a heartbeat can disappear (for example it belonged to a
    previous API process that was stopped), so "already running" is re-checked every few seconds instead of
    only at startup. A new worker starts only after the old heartbeat is stale (worker.STALE_S).
    """
    while not _supervisor_stop.wait(SUPERVISE_S):
        try:
            _start_worker()
        except Exception:
            log.exception("Worker supervisor check failed")


def _stop_worker() -> None:
    global _worker
    _supervisor_stop.set()
    if _worker and _worker.poll() is None:
        _worker.terminate()
        try:
            _worker.wait(timeout=10)
        except subprocess.TimeoutExpired:
            _worker.kill()
    _worker = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    init_db()
    if get_settings().worker_autostart:
        _supervisor_stop.clear()
        _start_worker()
        atexit.register(_stop_worker)
        threading.Thread(target=_supervise, name="worker-supervisor", daemon=True).start()
    yield
    _stop_worker()


def create_app() -> FastAPI:
    s = get_settings()
    app = FastAPI(title="Kisan Drishti ML API", version="1.0.0", lifespan=lifespan, docs_url="/docs", redoc_url=None)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=s.cors_origins,
        allow_credentials=False,  # bearer tokens only — no cookies, so no CSRF surface
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
        allow_headers=["Authorization", "Content-Type", "X-Upload-Filename"],
        max_age=600,
    )

    @app.exception_handler(AppError)
    async def _app_error(_: Request, e: AppError):
        body = {"error": {"code": e.code, "message": e.message, **({"details": e.details} if e.details else {})}}
        return JSONResponse(body, status_code=e.status)

    @app.exception_handler(RequestValidationError)
    async def _validation(_: Request, e: RequestValidationError):
        issues = [{"field": ".".join(str(p) for p in err.get("loc", [])[1:]), "message": err.get("msg", "Invalid value")} for err in e.errors()][:20]
        return JSONResponse({"error": {"code": "invalid_request", "message": "Some values are not valid.", "details": {"issues": issues}}}, status_code=422)

    @app.exception_handler(StarletteHTTPException)
    async def _http(_: Request, e: StarletteHTTPException):
        return JSONResponse({"error": {"code": "http_error", "message": str(e.detail) if e.status_code < 500 else "Server error."}}, status_code=e.status_code)

    @app.exception_handler(Exception)
    async def _unexpected(_: Request, e: Exception):
        log.exception("Unhandled error")
        return JSONResponse({"error": {"code": "internal_error", "message": "Something went wrong on the server. Please try again."}}, status_code=500)

    predict_limiter = RateLimiter(s.predict_rate_limit_per_min, 60)

    @app.get("/health")
    def health():
        return {"status": "ok"}

    @app.get("/v1/disease/model")
    def disease_model():
        return inference.public_model_card()

    @app.post("/v1/disease/predict")
    async def disease_predict(request: Request):
        if not predict_limiter.allow(client_ip(request)):
            raise AppError(429, "rate_limited", "Too many photos in a short time. Please wait a minute and try again.")
        ctype = (request.headers.get("content-type") or "").split(";")[0].strip().lower()
        if ctype not in ("image/jpeg", "image/png", "image/webp"):
            raise AppError(415, "unsupported_type", "Please use a JPG, PNG or WebP photo.")
        data = await read_body_limited(request, get_settings().max_predict_bytes)
        return await run_in_threadpool(inference.predict_active, data)

    app.include_router(admin_router, prefix="/v1/admin")
    return app


app = create_app()
