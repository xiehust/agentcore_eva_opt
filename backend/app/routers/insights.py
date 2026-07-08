"""Insight reports: failure analysis / user intent / execution summary.

Insights reuse the batch-evaluation API (StartBatchEvaluation with `insights`
instead of `evaluators` — mutually exclusive). One background job starts the
analysis and polls to completion; the report row in SQLite is updated at each
phase so history survives reloads and backend restarts.

Scope: sessions come from EITHER a past run (its exact sessionIds) OR a
lookback time window over the agent's recent traffic. Max 500 sessions and
only ONE active batch evaluation per account — a concurrent evaluation run
(scoring or insights) makes the service reject the start call.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi import APIRouter, HTTPException

from .. import agentcore, db, jobs
from ..aws import data, get_session
from ..models import InsightReportCreateRequest
from ..telemetry import resolve_telemetry

router = APIRouter(prefix="/api", tags=["insights"])

# Insights jobs cluster sessions with LLM analysis — allow up to ~30 min.
_POLL_INTERVAL = 30.0
_MAX_POLLS = 60


def _get_or_404(report_id: str) -> dict[str, Any]:
    report = db.get_insight_report(report_id)
    if report is None:
        raise HTTPException(status_code=404, detail="unknown insight report id")
    return report


@router.get("/insights")
def list_insight_reports() -> dict[str, Any]:
    return {"reports": db.list_insight_reports()}


@router.get("/insights/{report_id}")
def get_insight_report(report_id: str) -> dict[str, Any]:
    return _get_or_404(report_id)


@router.delete("/insights/{report_id}")
def delete_insight_report(report_id: str) -> dict[str, Any]:
    _get_or_404(report_id)
    db.delete_insight_report(report_id)
    return {"ok": True}


@router.post("/insights", status_code=201)
def create_insight_report(req: InsightReportCreateRequest) -> dict[str, Any]:
    agent = db.get_agent(req.agentId)
    if agent is None:
        raise HTTPException(status_code=404, detail="unknown agent id")
    # Insights read telemetry, not the runtime — any agent whose traces land
    # in CloudWatch qualifies (deployed managed OR external with a binding).
    try:
        service_name, log_group = resolve_telemetry(agent)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    insights = req.insights or list(agentcore.INSIGHT_TYPES)
    unknown = [i for i in insights if i not in agentcore.INSIGHT_TYPES]
    if unknown:
        raise HTTPException(status_code=422, detail=f"unknown insight ids: {unknown}")

    # Session scope: a past run's sessionIds XOR a lookback window.
    if (req.runId is None) == (req.lookbackHours is None):
        raise HTTPException(
            status_code=422, detail="provide exactly one of runId or lookbackHours"
        )
    session_ids: list[str] | None = None
    time_range: dict[str, Any] | None = None
    source = "agent"
    if req.runId is not None:
        run = db.get_run(req.runId)
        if run is None:
            raise HTTPException(status_code=404, detail="unknown run id")
        if not run.get("sessionIds"):
            raise HTTPException(
                status_code=400, detail="run has no recorded session ids yet"
            )
        session_ids = run["sessionIds"]
        source = f"run:{req.runId}"
    else:
        lookback = req.lookbackHours or 0
        if lookback < 1 or lookback > 24 * 14:
            raise HTTPException(
                status_code=422, detail="lookbackHours must be between 1 and 336"
            )
        end = datetime.now(UTC)
        start = end - timedelta(hours=lookback)
        # Stored as ISO strings; converted to datetimes for the boto3 call.
        time_range = {"startTime": start.isoformat(), "endTime": end.isoformat()}

    report_id = uuid.uuid4().hex[:12]
    db.create_insight_report(
        report_id,
        agent_id=req.agentId,
        agent_name=agent["name"],
        source=source,
        insights=insights,
        session_ids=session_ids,
        time_range=time_range,
        status="pending",
    )

    def _run(progress: Any) -> dict[str, Any]:
        try:
            session = get_session(req.creds)
            client = data(session)

            db.update_insight_report(report_id, status="analyzing")
            # Same naming constraint as evaluations: [a-zA-Z][a-zA-Z0-9_]{0,47}.
            resp = agentcore.start_insights_evaluation(
                client,
                name=f"insights_{report_id[:8]}",
                service_name=service_name,
                log_groups=["aws/spans", log_group],
                insights=insights,
                session_ids=session_ids,
                time_range=(
                    {
                        "startTime": datetime.fromisoformat(time_range["startTime"]),
                        "endTime": datetime.fromisoformat(time_range["endTime"]),
                    }
                    if time_range
                    else None
                ),
            )
            batch_id = resp["batchEvaluationId"]
            db.update_insight_report(report_id, batch_eval_id=batch_id)

            result = agentcore.poll_batch_evaluation(
                client,
                batch_id=batch_id,
                progress=progress,
                interval=_POLL_INTERVAL,
                max_polls=_MAX_POLLS,
            )
            status = result.get("status")
            if status not in ("COMPLETED", "COMPLETED_WITH_ERRORS"):
                raise RuntimeError(f"insights analysis ended with status {status}")

            results = agentcore.parse_insights(result)
            db.update_insight_report(report_id, status="completed", results=results)
            return {
                "reportId": report_id,
                "batchEvaluationId": batch_id,
                "status": status,
                "results": results,
            }
        except Exception as exc:
            db.update_insight_report(
                report_id, status="failed", error=f"{type(exc).__name__}: {exc}"
            )
            raise

    job_id = jobs.start_job(_run)
    db.update_insight_report(report_id, job_id=job_id)
    return {"reportId": report_id, "jobId": job_id}
