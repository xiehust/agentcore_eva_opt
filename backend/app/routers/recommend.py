"""Recommendation endpoints (real start_recommendation, background jobs).

Both endpoints fall back to the current value when the service returns an error
or an errorCode, mirroring the notebook's defensive handling.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter

from .. import agentcore, jobs
from ..aws import DEFAULT_REGION, data, get_session, sts
from ..models import JobRef, SystemPromptRecRequest, ToolDescRecRequest

router = APIRouter(prefix="/api", tags=["recommend"])


def _resolve_log_group_arns(session: Any, names_or_arns: list[str]) -> list[str]:
    """Turn any log-group names into full ARNs using the session's account/region."""
    account = sts(session).get_caller_identity()["Account"]
    region = session.region_name or DEFAULT_REGION
    return [agentcore.to_log_group_arn(v, region, account) for v in names_or_arns]


@router.post("/recommend/system-prompt", response_model=JobRef)
def recommend_system_prompt(req: SystemPromptRecRequest) -> JobRef:
    def _run(progress: Any) -> dict[str, Any]:
        session = get_session(req.creds)
        client = data(session)
        progress("starting system-prompt recommendation")
        started = agentcore.start_system_prompt_recommendation(
            client,
            name=req.name,
            system_prompt=req.systemPrompt,
            log_group_arns=_resolve_log_group_arns(session, req.logGroupArns),
            service_names=req.serviceNames,
        )
        rec_id = started["recommendationId"]
        result = agentcore.poll_recommendation(
            client, recommendation_id=rec_id, progress=progress
        )
        rec = result.get("recommendationResult", {}).get(
            "systemPromptRecommendationResult", {}
        )
        recommended = rec.get("recommendedSystemPrompt")
        if rec.get("errorCode") or not recommended:
            recommended = req.systemPrompt  # documented fallback
        return {
            "recommendationId": rec_id,
            "status": result.get("status"),
            "recommendedSystemPrompt": recommended,
            "usedFallback": bool(rec.get("errorCode") or not rec.get("recommendedSystemPrompt")),
        }

    return JobRef(jobId=jobs.start_job(_run))


@router.post("/recommend/tool-descriptions", response_model=JobRef)
def recommend_tool_descriptions(req: ToolDescRecRequest) -> JobRef:
    def _run(progress: Any) -> dict[str, Any]:
        session = get_session(req.creds)
        client = data(session)
        progress("starting tool-description recommendation")
        started = agentcore.start_tool_description_recommendation(
            client,
            name=req.name,
            tools=req.tools,
            log_group_arns=_resolve_log_group_arns(session, req.logGroupArns),
            service_names=req.serviceNames,
        )
        rec_id = started["recommendationId"]
        result = agentcore.poll_recommendation(
            client, recommendation_id=rec_id, progress=progress
        )
        td = result.get("recommendationResult", {}).get(
            "toolDescriptionRecommendationResult", {}
        )
        current = {t["toolName"]: t["description"] for t in req.tools}
        recommended = dict(current)  # default: unchanged
        used_fallback = True
        if not td.get("errorCode"):
            returned = td.get("tools", [])
            keys = list(current.keys())
            for i, item in enumerate(returned):
                new_desc = item.get("recommendedToolDescription", "")
                tool_name = item.get("toolName") or (keys[i] if i < len(keys) else f"tool_{i}")
                if new_desc:
                    recommended[tool_name] = new_desc
                    used_fallback = False
        return {
            "recommendationId": rec_id,
            "status": result.get("status"),
            "recommendedToolDescriptions": recommended,
            "usedFallback": used_fallback,
        }

    return JobRef(jobId=jobs.start_job(_run))
