"""Local SQLite persistence so live-demo progress survives a backend restart.

Tables:
  * ``jobs``          — background-job status + result (JSON), so a completed
                        deploy/eval/etc. is still readable after a restart.
  * ``session_state`` — a per-session JSON snapshot of the frontend journey
                        (mode, active step, per-step status, artifacts). The
                        frontend rehydrates from this on load.
  * ``agents``        — user-authored agent code + optional extra pip
                        requirements (JSON) + last deployment state (JSON).
  * ``datasets``      — evaluation datasets: JSON items [{prompt, context?}].
  * ``runs``          — evaluation-run history (traffic → batch eval → scores).
  * ``insight_reports`` — insights-analysis history (failure patterns / user
                        intents / execution summaries over agent sessions).

**Credentials are never stored.** The frontend strips AK/SK before saving, and
this module has no notion of credentials.

Uses only the Python stdlib (``sqlite3``). WAL mode + a module-level lock make
it safe for the app's worker threads (single-process, single-operator).
"""

from __future__ import annotations

import json
import os
import sqlite3
import threading
import time
from pathlib import Path
from typing import Any

# DB lives under backend/data/ by default; override with LAB4_DB_PATH (":memory:"
# is used by tests). The directory is created on first connect.
_DEFAULT_PATH = Path(__file__).resolve().parent.parent / "data" / "lab4.db"
_DB_PATH = os.environ.get("LAB4_DB_PATH", str(_DEFAULT_PATH))

_lock = threading.Lock()
_conn: sqlite3.Connection | None = None


def _connect() -> sqlite3.Connection:
    global _conn
    if _conn is not None:
        return _conn
    if _DB_PATH not in (":memory:", ""):
        Path(_DB_PATH).parent.mkdir(parents=True, exist_ok=True)
    # check_same_thread=False: guarded by _lock, shared across worker threads.
    _conn = sqlite3.connect(_DB_PATH, check_same_thread=False)
    _conn.row_factory = sqlite3.Row
    if _DB_PATH not in (":memory:", ""):
        _conn.execute("PRAGMA journal_mode=WAL")
    _conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS jobs (
            id         TEXT PRIMARY KEY,
            state      TEXT NOT NULL,
            result     TEXT,
            error      TEXT,
            progress   TEXT,
            updated_at REAL NOT NULL
        );
        CREATE TABLE IF NOT EXISTS session_state (
            session_id TEXT PRIMARY KEY,
            data       TEXT NOT NULL,
            updated_at REAL NOT NULL
        );
        CREATE TABLE IF NOT EXISTS agents (
            id           TEXT PRIMARY KEY,
            name         TEXT NOT NULL,
            description  TEXT NOT NULL DEFAULT '',
            code         TEXT NOT NULL,
            requirements TEXT NOT NULL DEFAULT '[]',
            deployment   TEXT,
            config       TEXT,
            created_at   REAL NOT NULL,
            updated_at   REAL NOT NULL
        );
        CREATE TABLE IF NOT EXISTS datasets (
            id          TEXT PRIMARY KEY,
            name        TEXT NOT NULL,
            description TEXT NOT NULL DEFAULT '',
            items       TEXT NOT NULL,
            created_at  REAL NOT NULL,
            updated_at  REAL NOT NULL
        );
        CREATE TABLE IF NOT EXISTS runs (
            id            TEXT PRIMARY KEY,
            agent_id      TEXT NOT NULL,
            dataset_id    TEXT NOT NULL,
            agent_name    TEXT NOT NULL,
            dataset_name  TEXT NOT NULL,
            agent_arn     TEXT,
            evaluators    TEXT NOT NULL DEFAULT '[]',
            session_ids   TEXT,
            batch_eval_id TEXT,
            scores        TEXT,
            status        TEXT NOT NULL,
            error         TEXT,
            job_id        TEXT,
            created_at    REAL NOT NULL,
            updated_at    REAL NOT NULL
        );
        CREATE TABLE IF NOT EXISTS experiments (
            id                    TEXT PRIMARY KEY,
            name                  TEXT NOT NULL,
            agent_id              TEXT NOT NULL,
            agent_name            TEXT NOT NULL,
            challenger_agent_id   TEXT,
            challenger_agent_name TEXT,
            stage                 TEXT NOT NULL,
            artifacts             TEXT NOT NULL DEFAULT '{}',
            error                 TEXT,
            created_at            REAL NOT NULL,
            updated_at            REAL NOT NULL
        );
        CREATE TABLE IF NOT EXISTS insight_reports (
            id            TEXT PRIMARY KEY,
            agent_id      TEXT,
            agent_name    TEXT NOT NULL,
            source        TEXT NOT NULL,
            insights      TEXT NOT NULL DEFAULT '[]',
            session_ids   TEXT,
            time_range    TEXT,
            batch_eval_id TEXT,
            results       TEXT,
            status        TEXT NOT NULL,
            error         TEXT,
            job_id        TEXT,
            created_at    REAL NOT NULL,
            updated_at    REAL NOT NULL
        );
        """
    )
    # Lightweight migration: agents.config was added after the table shipped.
    cols = [r[1] for r in _conn.execute("PRAGMA table_info(agents)")]
    if "config" not in cols:
        _conn.execute("ALTER TABLE agents ADD COLUMN config TEXT")
    _conn.commit()
    return _conn


def init() -> None:
    """Initialize the database (idempotent)."""
    with _lock:
        _connect()


def reset_for_tests() -> None:
    """Drop the cached connection (tests set LAB4_DB_PATH=:memory: per case)."""
    global _conn
    with _lock:
        if _conn is not None:
            _conn.close()
        _conn = None


# ─── Jobs ────────────────────────────────────────────────────────────────────
def upsert_job(
    job_id: str,
    *,
    state: str,
    result: Any | None = None,
    error: str | None = None,
    progress: str | None = None,
) -> None:
    with _lock:
        conn = _connect()
        conn.execute(
            """
            INSERT INTO jobs (id, state, result, error, progress, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                state=excluded.state,
                result=excluded.result,
                error=excluded.error,
                progress=excluded.progress,
                updated_at=excluded.updated_at
            """,
            (
                job_id,
                state,
                json.dumps(result) if result is not None else None,
                error,
                progress,
                time.time(),
            ),
        )
        conn.commit()


def get_job(job_id: str) -> dict[str, Any] | None:
    with _lock:
        conn = _connect()
        row = conn.execute("SELECT * FROM jobs WHERE id = ?", (job_id,)).fetchone()
    if row is None:
        return None
    return {
        "id": row["id"],
        "state": row["state"],
        "result": json.loads(row["result"]) if row["result"] else None,
        "error": row["error"],
        "progress": row["progress"],
    }


# ─── Session state ─────────────────────────────────────────────────────────
def save_session(session_id: str, data: dict[str, Any]) -> None:
    with _lock:
        conn = _connect()
        conn.execute(
            """
            INSERT INTO session_state (session_id, data, updated_at)
            VALUES (?, ?, ?)
            ON CONFLICT(session_id) DO UPDATE SET
                data=excluded.data, updated_at=excluded.updated_at
            """,
            (session_id, json.dumps(data), time.time()),
        )
        conn.commit()


def load_session(session_id: str) -> dict[str, Any] | None:
    with _lock:
        conn = _connect()
        row = conn.execute(
            "SELECT data FROM session_state WHERE session_id = ?", (session_id,)
        ).fetchone()
    return json.loads(row["data"]) if row else None


def delete_session(session_id: str) -> None:
    with _lock:
        conn = _connect()
        conn.execute("DELETE FROM session_state WHERE session_id = ?", (session_id,))
        conn.commit()


# ─── Agents ─────────────────────────────────────────────────────────────────
def _agent_row_to_dict(row: sqlite3.Row, *, include_code: bool = True) -> dict[str, Any]:
    d: dict[str, Any] = {
        "id": row["id"],
        "name": row["name"],
        "description": row["description"],
        "requirements": json.loads(row["requirements"]),
        "deployment": json.loads(row["deployment"]) if row["deployment"] else None,
        # {systemPrompt, toolDescriptions} — read by recommendations + bundles.
        "config": json.loads(row["config"]) if row["config"] else None,
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
    }
    if include_code:
        d["code"] = row["code"]
    return d


def create_agent(
    agent_id: str,
    *,
    name: str,
    description: str = "",
    code: str,
    requirements: list[str] | None = None,
    config: dict[str, Any] | None = None,
) -> None:
    now = time.time()
    with _lock:
        conn = _connect()
        conn.execute(
            """
            INSERT INTO agents (id, name, description, code, requirements,
                                deployment, config, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?)
            """,
            (
                agent_id,
                name,
                description,
                code,
                json.dumps(requirements or []),
                json.dumps(config) if config is not None else None,
                now,
                now,
            ),
        )
        conn.commit()


def list_agents() -> list[dict[str, Any]]:
    """List agents newest-first, WITHOUT code (keeps list responses light)."""
    with _lock:
        conn = _connect()
        rows = conn.execute("SELECT * FROM agents ORDER BY created_at DESC").fetchall()
    return [_agent_row_to_dict(r, include_code=False) for r in rows]


def get_agent(agent_id: str) -> dict[str, Any] | None:
    with _lock:
        conn = _connect()
        row = conn.execute("SELECT * FROM agents WHERE id = ?", (agent_id,)).fetchone()
    return _agent_row_to_dict(row) if row else None


def update_agent(
    agent_id: str,
    *,
    name: str | None = None,
    description: str | None = None,
    code: str | None = None,
    requirements: list[str] | None = None,
    config: dict[str, Any] | None = None,
) -> None:
    sets: list[str] = ["updated_at = ?"]
    params: list[Any] = [time.time()]
    if name is not None:
        sets.append("name = ?")
        params.append(name)
    if description is not None:
        sets.append("description = ?")
        params.append(description)
    if code is not None:
        sets.append("code = ?")
        params.append(code)
    if requirements is not None:
        sets.append("requirements = ?")
        params.append(json.dumps(requirements))
    if config is not None:
        sets.append("config = ?")
        params.append(json.dumps(config))
    params.append(agent_id)
    with _lock:
        conn = _connect()
        conn.execute(f"UPDATE agents SET {', '.join(sets)} WHERE id = ?", params)
        conn.commit()


def update_agent_deployment(agent_id: str, deployment: dict[str, Any] | None) -> None:
    with _lock:
        conn = _connect()
        conn.execute(
            "UPDATE agents SET deployment = ?, updated_at = ? WHERE id = ?",
            (json.dumps(deployment) if deployment is not None else None, time.time(), agent_id),
        )
        conn.commit()


def delete_agent(agent_id: str) -> None:
    with _lock:
        conn = _connect()
        conn.execute("DELETE FROM agents WHERE id = ?", (agent_id,))
        conn.commit()


# ─── Datasets ───────────────────────────────────────────────────────────────
def _dataset_row_to_dict(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "name": row["name"],
        "description": row["description"],
        "items": json.loads(row["items"]),
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
    }


def create_dataset(
    dataset_id: str,
    *,
    name: str,
    description: str = "",
    items: list[dict[str, Any]],
) -> None:
    now = time.time()
    with _lock:
        conn = _connect()
        conn.execute(
            """
            INSERT INTO datasets (id, name, description, items, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (dataset_id, name, description, json.dumps(items), now, now),
        )
        conn.commit()


def list_datasets() -> list[dict[str, Any]]:
    with _lock:
        conn = _connect()
        rows = conn.execute("SELECT * FROM datasets ORDER BY created_at DESC").fetchall()
    return [_dataset_row_to_dict(r) for r in rows]


def get_dataset(dataset_id: str) -> dict[str, Any] | None:
    with _lock:
        conn = _connect()
        row = conn.execute("SELECT * FROM datasets WHERE id = ?", (dataset_id,)).fetchone()
    return _dataset_row_to_dict(row) if row else None


def update_dataset(
    dataset_id: str,
    *,
    name: str | None = None,
    description: str | None = None,
    items: list[dict[str, Any]] | None = None,
) -> None:
    sets: list[str] = ["updated_at = ?"]
    params: list[Any] = [time.time()]
    if name is not None:
        sets.append("name = ?")
        params.append(name)
    if description is not None:
        sets.append("description = ?")
        params.append(description)
    if items is not None:
        sets.append("items = ?")
        params.append(json.dumps(items))
    params.append(dataset_id)
    with _lock:
        conn = _connect()
        conn.execute(f"UPDATE datasets SET {', '.join(sets)} WHERE id = ?", params)
        conn.commit()


def delete_dataset(dataset_id: str) -> None:
    with _lock:
        conn = _connect()
        conn.execute("DELETE FROM datasets WHERE id = ?", (dataset_id,))
        conn.commit()


# ─── Runs ───────────────────────────────────────────────────────────────────
def _run_row_to_dict(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "agentId": row["agent_id"],
        "datasetId": row["dataset_id"],
        "agentName": row["agent_name"],
        "datasetName": row["dataset_name"],
        "agentArn": row["agent_arn"],
        "evaluators": json.loads(row["evaluators"]),
        "sessionIds": json.loads(row["session_ids"]) if row["session_ids"] else None,
        "batchEvaluationId": row["batch_eval_id"],
        "scores": json.loads(row["scores"]) if row["scores"] else None,
        "status": row["status"],
        "error": row["error"],
        "jobId": row["job_id"],
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
    }


def create_run(
    run_id: str,
    *,
    agent_id: str,
    dataset_id: str,
    agent_name: str,
    dataset_name: str,
    agent_arn: str | None,
    evaluators: list[str],
    status: str = "pending",
    job_id: str | None = None,
) -> None:
    now = time.time()
    with _lock:
        conn = _connect()
        conn.execute(
            """
            INSERT INTO runs (id, agent_id, dataset_id, agent_name, dataset_name,
                              agent_arn, evaluators, status, job_id, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                run_id,
                agent_id,
                dataset_id,
                agent_name,
                dataset_name,
                agent_arn,
                json.dumps(evaluators),
                status,
                job_id,
                now,
                now,
            ),
        )
        conn.commit()


def list_runs() -> list[dict[str, Any]]:
    with _lock:
        conn = _connect()
        rows = conn.execute("SELECT * FROM runs ORDER BY created_at DESC").fetchall()
    return [_run_row_to_dict(r) for r in rows]


def get_run(run_id: str) -> dict[str, Any] | None:
    with _lock:
        conn = _connect()
        row = conn.execute("SELECT * FROM runs WHERE id = ?", (run_id,)).fetchone()
    return _run_row_to_dict(row) if row else None


def update_run(
    run_id: str,
    *,
    status: str | None = None,
    error: str | None = None,
    session_ids: list[str] | None = None,
    batch_eval_id: str | None = None,
    scores: list[dict[str, Any]] | None = None,
    job_id: str | None = None,
) -> None:
    sets: list[str] = ["updated_at = ?"]
    params: list[Any] = [time.time()]
    if status is not None:
        sets.append("status = ?")
        params.append(status)
    if error is not None:
        sets.append("error = ?")
        params.append(error)
    if session_ids is not None:
        sets.append("session_ids = ?")
        params.append(json.dumps(session_ids))
    if batch_eval_id is not None:
        sets.append("batch_eval_id = ?")
        params.append(batch_eval_id)
    if scores is not None:
        sets.append("scores = ?")
        params.append(json.dumps(scores))
    if job_id is not None:
        sets.append("job_id = ?")
        params.append(job_id)
    params.append(run_id)
    with _lock:
        conn = _connect()
        conn.execute(f"UPDATE runs SET {', '.join(sets)} WHERE id = ?", params)
        conn.commit()


def delete_run(run_id: str) -> None:
    with _lock:
        conn = _connect()
        conn.execute("DELETE FROM runs WHERE id = ?", (run_id,))
        conn.commit()


# ─── Experiments ────────────────────────────────────────────────────────────
def _experiment_row_to_dict(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "name": row["name"],
        "agentId": row["agent_id"],
        "agentName": row["agent_name"],
        "challengerAgentId": row["challenger_agent_id"],
        "challengerAgentName": row["challenger_agent_name"],
        "stage": row["stage"],
        "artifacts": json.loads(row["artifacts"]),
        "error": row["error"],
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
    }


def create_experiment(
    experiment_id: str,
    *,
    name: str,
    agent_id: str,
    agent_name: str,
    stage: str = "recommend",
) -> None:
    now = time.time()
    with _lock:
        conn = _connect()
        conn.execute(
            """
            INSERT INTO experiments (id, name, agent_id, agent_name, stage,
                                     artifacts, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, '{}', ?, ?)
            """,
            (experiment_id, name, agent_id, agent_name, stage, now, now),
        )
        conn.commit()


def list_experiments() -> list[dict[str, Any]]:
    with _lock:
        conn = _connect()
        rows = conn.execute(
            "SELECT * FROM experiments ORDER BY created_at DESC"
        ).fetchall()
    return [_experiment_row_to_dict(r) for r in rows]


def get_experiment(experiment_id: str) -> dict[str, Any] | None:
    with _lock:
        conn = _connect()
        row = conn.execute(
            "SELECT * FROM experiments WHERE id = ?", (experiment_id,)
        ).fetchone()
    return _experiment_row_to_dict(row) if row else None


def update_experiment(
    experiment_id: str,
    *,
    name: str | None = None,
    stage: str | None = None,
    challenger_agent_id: str | None = None,
    challenger_agent_name: str | None = None,
    artifacts: dict[str, Any] | None = None,
    error: str | None = None,
) -> None:
    """Partial update. ``artifacts`` is SHALLOW-MERGED into the stored blob
    (inside the module lock, so concurrent stage updates can't clobber each
    other); other fields overwrite when provided."""
    with _lock:
        conn = _connect()
        sets: list[str] = ["updated_at = ?"]
        params: list[Any] = [time.time()]
        if name is not None:
            sets.append("name = ?")
            params.append(name)
        if stage is not None:
            sets.append("stage = ?")
            params.append(stage)
        if challenger_agent_id is not None:
            sets.append("challenger_agent_id = ?")
            params.append(challenger_agent_id)
        if challenger_agent_name is not None:
            sets.append("challenger_agent_name = ?")
            params.append(challenger_agent_name)
        if error is not None:
            sets.append("error = ?")
            params.append(error)
        if artifacts is not None:
            row = conn.execute(
                "SELECT artifacts FROM experiments WHERE id = ?", (experiment_id,)
            ).fetchone()
            current = json.loads(row["artifacts"]) if row else {}
            sets.append("artifacts = ?")
            params.append(json.dumps({**current, **artifacts}))
        params.append(experiment_id)
        conn.execute(
            f"UPDATE experiments SET {', '.join(sets)} WHERE id = ?", params
        )
        conn.commit()


def delete_experiment(experiment_id: str) -> None:
    with _lock:
        conn = _connect()
        conn.execute("DELETE FROM experiments WHERE id = ?", (experiment_id,))
        conn.commit()


# ─── Insight reports ────────────────────────────────────────────────────────
def _insight_report_row_to_dict(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "agentId": row["agent_id"],
        "agentName": row["agent_name"],
        # "run:<runId>" (session-scoped) or "agent" (time-range scoped).
        "source": row["source"],
        "insights": json.loads(row["insights"]),
        "sessionIds": json.loads(row["session_ids"]) if row["session_ids"] else None,
        "timeRange": json.loads(row["time_range"]) if row["time_range"] else None,
        "batchEvaluationId": row["batch_eval_id"],
        "results": json.loads(row["results"]) if row["results"] else None,
        "status": row["status"],
        "error": row["error"],
        "jobId": row["job_id"],
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
    }


def create_insight_report(
    report_id: str,
    *,
    agent_id: str | None,
    agent_name: str,
    source: str,
    insights: list[str],
    session_ids: list[str] | None = None,
    time_range: dict[str, Any] | None = None,
    status: str = "pending",
) -> None:
    now = time.time()
    with _lock:
        conn = _connect()
        conn.execute(
            """
            INSERT INTO insight_reports (id, agent_id, agent_name, source,
                                         insights, session_ids, time_range,
                                         status, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                report_id,
                agent_id,
                agent_name,
                source,
                json.dumps(insights),
                json.dumps(session_ids) if session_ids is not None else None,
                json.dumps(time_range) if time_range is not None else None,
                status,
                now,
                now,
            ),
        )
        conn.commit()


def list_insight_reports() -> list[dict[str, Any]]:
    with _lock:
        conn = _connect()
        rows = conn.execute(
            "SELECT * FROM insight_reports ORDER BY created_at DESC"
        ).fetchall()
    return [_insight_report_row_to_dict(r) for r in rows]


def get_insight_report(report_id: str) -> dict[str, Any] | None:
    with _lock:
        conn = _connect()
        row = conn.execute(
            "SELECT * FROM insight_reports WHERE id = ?", (report_id,)
        ).fetchone()
    return _insight_report_row_to_dict(row) if row else None


def update_insight_report(
    report_id: str,
    *,
    status: str | None = None,
    error: str | None = None,
    batch_eval_id: str | None = None,
    results: dict[str, Any] | None = None,
    job_id: str | None = None,
) -> None:
    sets: list[str] = ["updated_at = ?"]
    params: list[Any] = [time.time()]
    if status is not None:
        sets.append("status = ?")
        params.append(status)
    if error is not None:
        sets.append("error = ?")
        params.append(error)
    if batch_eval_id is not None:
        sets.append("batch_eval_id = ?")
        params.append(batch_eval_id)
    if results is not None:
        sets.append("results = ?")
        params.append(json.dumps(results))
    if job_id is not None:
        sets.append("job_id = ?")
        params.append(job_id)
    params.append(report_id)
    with _lock:
        conn = _connect()
        conn.execute(
            f"UPDATE insight_reports SET {', '.join(sets)} WHERE id = ?", params
        )
        conn.commit()


def delete_insight_report(report_id: str) -> None:
    with _lock:
        conn = _connect()
        conn.execute("DELETE FROM insight_reports WHERE id = ?", (report_id,))
        conn.commit()
