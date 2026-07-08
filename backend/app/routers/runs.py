"""Evaluation runs: dataset traffic → wait for traces → batch eval → scores.

Two shapes share the runs table, distinguished by ``source``:
  * active  (datasetId)               — invoke the agent per item, wait for
    traces, then batch-evaluate exactly those sessions.
  * passive (lookbackHours/sessionIds) — zero invocation: batch-evaluate the
    agent's EXISTING traffic, scoped by a time window or explicit session ids.
    Works for any agent whose telemetry lands in CloudWatch (external agents
    included) — see app.telemetry.resolve_telemetry.

One background job drives the whole pipeline; the run row in SQLite is updated
at each phase so history survives reloads and backend restarts.
"""

from __future__ import annotations

import time
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi import APIRouter, HTTPException

from .. import agentcore, db, invokers, jobs
from ..aws import data, get_session
from ..models import RunCreateRequest, format_prompt
from ..telemetry import resolve_telemetry

router = APIRouter(prefix="/api", tags=["runs"])

# Injectable for tests (monkeypatched to a no-op).
_sleep = time.sleep


def _get_or_404(run_id: str) -> dict[str, Any]:
    run = db.get_run(run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="unknown run id")
    return run


@router.get("/runs")
def list_runs() -> dict[str, Any]:
    return {"runs": db.list_runs()}


@router.get("/runs/{run_id}")
def get_run(run_id: str) -> dict[str, Any]:
    return _get_or_404(run_id)


@router.delete("/runs/{run_id}")
def delete_run(run_id: str) -> dict[str, Any]:
    _get_or_404(run_id)
    db.delete_run(run_id)
    return {"ok": True}


def _resolve_telemetry_or_400(agent: dict[str, Any]) -> tuple[str, str]:
    try:
        return resolve_telemetry(agent)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/runs", status_code=201)
def create_run(req: RunCreateRequest) -> dict[str, Any]:
    agent = db.get_agent(req.agentId)
    if agent is None:
        raise HTTPException(status_code=404, detail="unknown agent id")

    # Exactly one scope: datasetId (active) XOR lookbackHours/sessionIds (passive).
    scopes = [req.datasetId is not None, req.lookbackHours is not None, req.sessionIds is not None]
    if sum(scopes) != 1:
        raise HTTPException(
            status_code=422,
            detail="provide exactly one of datasetId, lookbackHours or sessionIds",
        )

    if req.datasetId is not None:
        return _create_active_run(req, agent)
    return _create_passive_run(req, agent)


# ─── Active: dataset traffic → wait → eval by session ids ───────────────────
def _create_active_run(req: RunCreateRequest, agent: dict[str, Any]) -> dict[str, Any]:
    deployment = agent.get("deployment") or {}
    has_invoker = deployment.get("status") == "deployed" or bool(
        ((agent.get("binding") or {}).get("invoke") or {}).get("url")
    )
    if not has_invoker:
        detail = (
            "external agent has no invoke binding"
            if agent.get("kind") == "external"
            else "agent is not deployed"
        )
        raise HTTPException(status_code=400, detail=detail)
    service_name, log_group = _resolve_telemetry_or_400(agent)
    dataset = db.get_dataset(req.datasetId or "")
    if dataset is None:
        raise HTTPException(status_code=404, detail="unknown dataset id")
    items: list[dict[str, Any]] = dataset["items"]
    if not items:
        raise HTTPException(status_code=400, detail="dataset is empty")

    evaluators = req.evaluators or list(agentcore.BUILTIN_EVALUATORS)
    run_id = uuid.uuid4().hex[:12]
    agent_arn = deployment.get("runtimeArn")
    db.create_run(
        run_id,
        agent_id=req.agentId,
        dataset_id=req.datasetId or "",
        agent_name=agent["name"],
        dataset_name=dataset["name"],
        agent_arn=agent_arn,
        evaluators=evaluators,
        status="pending",
        source="dataset",
    )

    wait_seconds = max(0, req.waitSeconds)

    def _run(progress: Any) -> dict[str, Any]:
        try:
            session = get_session(req.creds)

            # 1. Traffic: one session per dataset item, via whichever invoker
            #    the agent supports (AgentCore runtime or external HTTP).
            db.update_run(run_id, status="invoking")
            client = data(session)
            invoke = invokers.resolve_invoker(agent, client)
            assert invoke is not None  # guarded above
            session_ids: list[str] = []
            for i, item in enumerate(items):
                sid = str(uuid.uuid4())
                full = format_prompt(item["prompt"], context=item.get("context"))
                invoke(sid, full)
                session_ids.append(sid)
                progress(f"sent {i + 1}/{len(items)}")
            db.update_run(run_id, session_ids=session_ids)

            # 2. Give the traces time to land in CloudWatch before evaluating.
            db.update_run(run_id, status="waiting")
            progress(f"waiting {wait_seconds}s for traces to land in CloudWatch")
            _sleep(wait_seconds)

            # 3. Batch evaluation over just this run's sessions.
            db.update_run(run_id, status="evaluating")
            # Batch evaluation names must match [a-zA-Z][a-zA-Z0-9_]{0,47} —
            # no hyphens, must start with a letter.
            resp = agentcore.start_batch_evaluation(
                client,
                name=f"run_{run_id[:8]}",
                service_name=service_name,
                log_groups=["aws/spans", log_group],
                session_ids=session_ids,
                evaluators=evaluators,
            )
            batch_id = resp["batchEvaluationId"]
            db.update_run(run_id, batch_eval_id=batch_id)
            result = agentcore.poll_batch_evaluation(
                client, batch_id=batch_id, progress=progress
            )
            scores = agentcore.parse_eval_scores(result)

            db.update_run(run_id, status="completed", scores=scores)
            return {
                "runId": run_id,
                "batchEvaluationId": batch_id,
                "status": result.get("status"),
                "scores": scores,
                "sessionIds": session_ids,
            }
        except Exception as exc:
            db.update_run(
                run_id, status="failed", error=f"{type(exc).__name__}: {exc}"
            )
            raise

    job_id = jobs.start_job(_run)
    db.update_run(run_id, job_id=job_id)
    return {"runId": run_id, "jobId": job_id}


# ─── Passive: eval existing traffic (timeRange or explicit session ids) ─────
def _create_passive_run(req: RunCreateRequest, agent: dict[str, Any]) -> dict[str, Any]:
    service_name, log_group = _resolve_telemetry_or_400(agent)

    session_ids: list[str] | None = None
    time_range: dict[str, Any] | None = None
    if req.sessionIds is not None:
        session_ids = [s.strip() for s in req.sessionIds if s.strip()]
        if not session_ids:
            raise HTTPException(status_code=422, detail="sessionIds is empty")
        source = f"sessions:{len(session_ids)}"
    else:
        lookback = req.lookbackHours or 0
        if lookback < 1 or lookback > 24 * 14:
            raise HTTPException(
                status_code=422, detail="lookbackHours must be between 1 and 336"
            )
        end = datetime.now(UTC)
        time_range = {"startTime": end - timedelta(hours=lookback), "endTime": end}
        source = f"lookback:{lookback}"

    evaluators = req.evaluators or list(agentcore.BUILTIN_EVALUATORS)
    run_id = uuid.uuid4().hex[:12]
    db.create_run(
        run_id,
        agent_id=req.agentId,
        dataset_id="",
        agent_name=agent["name"],
        dataset_name="",
        agent_arn=(agent.get("deployment") or {}).get("runtimeArn"),
        evaluators=evaluators,
        status="pending",
        source=source,
    )
    if session_ids:
        db.update_run(run_id, session_ids=session_ids)

    def _run(progress: Any) -> dict[str, Any]:
        try:
            client = data(get_session(req.creds))
            # No traffic phase: evaluate what already landed in CloudWatch.
            db.update_run(run_id, status="evaluating")
            resp = agentcore.start_batch_evaluation(
                client,
                name=f"run_{run_id[:8]}",
                service_name=service_name,
                log_groups=["aws/spans", log_group],
                session_ids=session_ids,
                time_range=time_range,
                evaluators=evaluators,
            )
            batch_id = resp["batchEvaluationId"]
            db.update_run(run_id, batch_eval_id=batch_id)
            result = agentcore.poll_batch_evaluation(
                client, batch_id=batch_id, progress=progress
            )
            scores = agentcore.parse_eval_scores(result)

            db.update_run(run_id, status="completed", scores=scores)
            return {
                "runId": run_id,
                "batchEvaluationId": batch_id,
                "status": result.get("status"),
                "scores": scores,
                "sessionIds": session_ids,
            }
        except Exception as exc:
            db.update_run(
                run_id, status="failed", error=f"{type(exc).__name__}: {exc}"
            )
            raise

    job_id = jobs.start_job(_run)
    db.update_run(run_id, job_id=job_id)
    return {"runId": run_id, "jobId": job_id}
