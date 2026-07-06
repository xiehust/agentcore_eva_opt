"""Batch evaluation endpoint (real start_batch_evaluation, background job)."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter

from .. import agentcore, jobs
from ..aws import data, get_session
from ..models import EvaluateRequest, JobRef

router = APIRouter(prefix="/api", tags=["evaluate"])


@router.post("/evaluate", response_model=JobRef)
def evaluate(req: EvaluateRequest) -> JobRef:
    def _run(progress: Any) -> dict[str, Any]:
        client = data(get_session(req.creds))
        progress("starting batch evaluation")
        started = agentcore.start_batch_evaluation(
            client,
            name=req.batchName,
            service_name=req.serviceName,
            log_groups=req.logGroups,
            session_ids=req.sessionIds,
            evaluators=req.evaluators,
        )
        batch_id = started["batchEvaluationId"]
        result = agentcore.poll_batch_evaluation(
            client, batch_id=batch_id, progress=progress
        )
        scores = agentcore.parse_eval_scores(result)
        return {
            "batchEvaluationId": batch_id,
            "status": result.get("status"),
            "scores": scores,
        }

    return JobRef(jobId=jobs.start_job(_run))
