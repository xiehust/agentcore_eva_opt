"""Evaluation runs: dataset traffic → wait for traces → batch eval → scores.

One background job drives the whole pipeline; the run row in SQLite is updated
at each phase so history survives reloads and backend restarts.
"""

from __future__ import annotations

import time
import uuid
from typing import Any

from fastapi import APIRouter, HTTPException

from .. import agentcore, db, jobs
from ..aws import data, get_session
from ..models import RunCreateRequest, format_prompt

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


@router.post("/runs", status_code=201)
def create_run(req: RunCreateRequest) -> dict[str, Any]:
    agent = db.get_agent(req.agentId)
    if agent is None:
        raise HTTPException(status_code=404, detail="unknown agent id")
    deployment = agent.get("deployment") or {}
    if deployment.get("status") != "deployed":
        raise HTTPException(status_code=400, detail="agent is not deployed")
    dataset = db.get_dataset(req.datasetId)
    if dataset is None:
        raise HTTPException(status_code=404, detail="unknown dataset id")
    items: list[dict[str, Any]] = dataset["items"]
    if not items:
        raise HTTPException(status_code=400, detail="dataset is empty")

    evaluators = req.evaluators or list(agentcore.BUILTIN_EVALUATORS)
    run_id = uuid.uuid4().hex[:12]
    agent_arn = deployment["runtimeArn"]
    db.create_run(
        run_id,
        agent_id=req.agentId,
        dataset_id=req.datasetId,
        agent_name=agent["name"],
        dataset_name=dataset["name"],
        agent_arn=agent_arn,
        evaluators=evaluators,
        status="pending",
    )

    wait_seconds = max(0, req.waitSeconds)

    def _run(progress: Any) -> dict[str, Any]:
        try:
            session = get_session(req.creds)

            # 1. Traffic: one runtime session per dataset item.
            db.update_run(run_id, status="invoking")
            client = data(session)
            session_ids: list[str] = []
            for i, item in enumerate(items):
                sid = str(uuid.uuid4())
                full = format_prompt(item["prompt"], context=item.get("context"))
                agentcore.invoke_agent_runtime(
                    client, agent_arn=agent_arn, session_id=sid, prompt=full
                )
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
                service_name=deployment["serviceName"],
                log_groups=["aws/spans", deployment["logGroup"]],
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
