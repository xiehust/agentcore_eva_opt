"""Background-job store (in-memory cache + SQLite persistence) + poll endpoint.

Long AWS operations (deploy, batch eval, recommendation, A/B monitor) run on a
worker thread so the request handler returns immediately with a jobId. Clients
poll GET /api/jobs/{id}. Status + results are mirrored to a local SQLite DB so a
completed job is still readable after the backend restarts. Single-process,
single-operator.
"""

from __future__ import annotations

import threading
import uuid
from collections.abc import Callable
from typing import Any

from fastapi import APIRouter, HTTPException

from . import db
from .models import JobStatus

router = APIRouter(prefix="/api", tags=["jobs"])

_jobs: dict[str, JobStatus] = {}
_lock = threading.Lock()


def create_job() -> str:
    job_id = uuid.uuid4().hex
    with _lock:
        _jobs[job_id] = JobStatus(id=job_id, state="pending")
    db.upsert_job(job_id, state="pending")
    return job_id


def _update(job_id: str, **fields: Any) -> None:
    with _lock:
        job = _jobs.get(job_id)
        if job is None:
            return
        job = job.model_copy(update=fields)
        _jobs[job_id] = job
    # Mirror the full current status to the DB (outside the lock).
    db.upsert_job(
        job_id,
        state=job.state,
        result=job.result,
        error=job.error,
        progress=job.progress,
    )


def set_progress(job_id: str, progress: str) -> None:
    _update(job_id, progress=progress)


def get(job_id: str) -> JobStatus | None:
    with _lock:
        cached = _jobs.get(job_id)
    if cached is not None:
        return cached
    # Not in memory (e.g. after a restart) — rehydrate from SQLite.
    row = db.get_job(job_id)
    if row is None:
        return None
    job = JobStatus(**row)
    with _lock:
        _jobs.setdefault(job_id, job)
    return job


def run_job(job_id: str, fn: Callable[[Callable[[str], None]], Any]) -> None:
    """Execute ``fn`` on a worker thread. ``fn`` receives a progress callback.

    The function's return value becomes the job result; any exception is
    captured as the job error (never crashes the server).
    """

    def _worker() -> None:
        _update(job_id, state="running")

        def progress(msg: str) -> None:
            set_progress(job_id, msg)

        try:
            result = fn(progress)
            _update(job_id, state="completed", result=result)
        except Exception as exc:  # noqa: BLE001 — surface any failure as job error
            _update(job_id, state="failed", error=f"{type(exc).__name__}: {exc}")

    threading.Thread(target=_worker, daemon=True).start()


def start_job(fn: Callable[[Callable[[str], None]], Any]) -> str:
    """Create a job and start it; return the jobId."""
    job_id = create_job()
    run_job(job_id, fn)
    return job_id


@router.get("/jobs/{job_id}", response_model=JobStatus)
def get_job(job_id: str) -> JobStatus:
    job = get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="unknown job id")
    return job
