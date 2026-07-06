"""Custom evaluator endpoints (create / list / delete) + built-in catalog."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter

from .. import agentcore
from ..aws import control, get_session
from ..models import CreateEvaluatorRequest, CredsRequest

router = APIRouter(prefix="/api", tags=["evaluators"])


@router.get("/evaluators/builtin")
def builtin_catalog() -> dict[str, Any]:
    """The 13 built-in evaluators with their evaluation level (static)."""
    return {
        "evaluators": [
            {"evaluatorId": eid, "level": level}
            for eid, level in agentcore.ALL_BUILTIN_EVALUATORS.items()
        ]
    }


@router.post("/evaluators")
def create_evaluator(req: CreateEvaluatorRequest) -> dict[str, Any]:
    client = control(get_session(req.creds))
    resp = agentcore.create_llm_judge_evaluator(
        client,
        name=req.name,
        instructions=req.instructions,
        rating_scale=[p.model_dump() for p in req.ratingScale],
        model_id=req.modelId,
        level=req.level,
        description=req.description,
    )
    return {
        "evaluatorId": resp.get("evaluatorId"),
        "evaluatorArn": resp.get("evaluatorArn"),
        "status": resp.get("status"),
    }


@router.post("/evaluators/list")
def list_evaluators(req: CredsRequest) -> dict[str, Any]:
    client = control(get_session(req.creds))
    evs = agentcore.list_evaluators(client)
    return {
        "evaluators": [
            {
                "evaluatorId": e.get("evaluatorId"),
                "name": e.get("evaluatorName"),
                "type": e.get("evaluatorType"),
                "level": e.get("level"),
                "status": e.get("status"),
            }
            for e in evs
        ]
    }


@router.delete("/evaluators/{evaluator_id}")
def delete_evaluator(evaluator_id: str) -> dict[str, Any]:
    client = control(get_session(None))
    agentcore.delete_evaluator(client, evaluator_id=evaluator_id)
    return {"evaluatorId": evaluator_id, "deleted": True}
