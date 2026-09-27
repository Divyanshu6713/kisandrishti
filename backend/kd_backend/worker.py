"""
Background worker: the only process that extracts/validates datasets and trains models, so the web API
stays responsive. Start it with:

    python -m kd_backend.worker

By default the API starts one automatically (ML_WORKER_AUTOSTART=true). To train on a separate GPU
machine, set ML_WORKER_AUTOSTART=false on the web server and run this module on the GPU machine with the
same ML_STORAGE_PATH / ML_DATABASE_PATH (shared disk). For multiple machines, swap SQLite for a server
database and local disk for object storage first (see docs/ML_TRAINING_SYSTEM.md).

Jobs are claimed with an atomic UPDATE, so two workers never run the same job. A heartbeat row lets the
admin UI show whether a worker is online and which device it trains on.
"""
from __future__ import annotations

import logging
import os
import socket
import threading
import time
import uuid

from .config import get_settings
from .datasets import service as datasets
from .db import connect, init_db, now
from . import training

log = logging.getLogger("kd.worker")
HEARTBEAT_S = 5
STALE_S = 30


def _device() -> tuple[str, str]:
    try:
        import torch

        want = get_settings().training_device
        if want != "cpu" and torch.cuda.is_available():
            return "cuda", torch.cuda.get_device_name(0)
        return "cpu", "CPU"
    except Exception:
        return "unavailable", "PyTorch is not installed"


class Heartbeat(threading.Thread):
    def __init__(self, worker_id: str, device: tuple[str, str]):
        super().__init__(daemon=True)
        self.worker_id = worker_id
        self.task: str | None = None
        self.stop = threading.Event()
        with connect() as c:
            c.execute(
                "INSERT OR REPLACE INTO worker_heartbeat (worker_id, pid, host, device, device_name, started_at, last_seen, current_task) VALUES (?, ?, ?, ?, ?, ?, ?, NULL)",
                (worker_id, os.getpid(), socket.gethostname()[:80], device[0], device[1][:120], now(), now()),
            )

    def run(self) -> None:
        while not self.stop.wait(HEARTBEAT_S):
            try:
                with connect() as c:
                    c.execute("UPDATE worker_heartbeat SET last_seen = ?, current_task = ? WHERE worker_id = ?", (now(), self.task, self.worker_id))
            except Exception:
                log.exception("heartbeat failed")

    def close(self) -> None:
        self.stop.set()
        with connect() as c:
            c.execute("DELETE FROM worker_heartbeat WHERE worker_id = ?", (self.worker_id,))


def other_live_workers(me: str | None = None) -> list[dict]:
    from datetime import datetime, timedelta, timezone

    cutoff = (datetime.now(timezone.utc) - timedelta(seconds=STALE_S)).isoformat(timespec="seconds").replace("+00:00", "Z")
    with connect() as c:
        rows = c.execute("SELECT * FROM worker_heartbeat WHERE last_seen >= ?", (cutoff,)).fetchall()
    return [dict(r) for r in rows if r["worker_id"] != me]


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    s = get_settings()
    init_db()
    worker_id = f"w_{socket.gethostname()[:20]}_{os.getpid()}_{uuid.uuid4().hex[:6]}"
    device = _device()
    log.info("Worker %s starting (device=%s %s)", worker_id, *device)

    if not other_live_workers(worker_id):
        # No other live worker: anything still marked running was left by a dead worker.
        datasets.recover_interrupted()
        training.recover_interrupted(worker_id)
    hb = Heartbeat(worker_id, device)
    hb.start()
    last_cleanup = 0.0
    current_job: str | None = None
    try:
        while True:
            if time.monotonic() - last_cleanup > 3600:
                last_cleanup = time.monotonic()
                n = datasets.cleanup_stale_uploads()
                if n:
                    log.info("Cleaned %d stale uploads", n)
            dsv = datasets.claim_next_ingest()
            if dsv:
                hb.task = f"validating {dsv}"
                log.info("Validating dataset version %s", dsv)
                datasets.ingest(dsv)
                hb.task = None
                continue
            job = training.claim_next_job(worker_id)
            if job:
                from .ml.trainer import run_job

                current_job = job
                hb.task = f"training {job}"
                with connect() as c:
                    c.execute("UPDATE training_jobs SET worker_id = ? WHERE id = ?", (worker_id, job))
                log.info("Training job %s", job)
                run_job(job)
                current_job = None
                hb.task = None
                continue
            time.sleep(s.worker_poll_seconds)
    except KeyboardInterrupt:
        log.info("Worker stopping")
    finally:
        if current_job:
            t = now()
            with connect() as c:
                c.execute(
                    "UPDATE training_jobs SET status = 'failed', error_code = 'worker_stopped', error_message = 'The training worker was stopped before this job finished.', finished_at = ?, updated_at = ? WHERE id = ? AND status NOT IN ('completed', 'failed', 'cancelled')",
                    (t, t, current_job),
                )
                c.execute("UPDATE models SET status = 'failed', status_detail = 'Training was interrupted.' WHERE training_job_id = ? AND status = 'training'", (current_job,))
        hb.close()


if __name__ == "__main__":
    main()
