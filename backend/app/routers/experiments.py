"""Optimization-experiment records (thin CRUD; the frontend orchestrates each
stage by calling the existing recommend/bundles/gateway/abtest endpoints and
persisting job ids + results into the experiment's artifacts blob)."""

from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, HTTPException

from .. import db
from ..models import (
    EXPERIMENT_STAGES,
    ExperimentCreateRequest,
    ExperimentUpdateRequest,
)

router = APIRouter(prefix="/api", tags=["experiments"])


def _get_or_404(experiment_id: str) -> dict[str, Any]:
    exp = db.get_experiment(experiment_id)
    if exp is None:
        raise HTTPException(status_code=404, detail="unknown experiment id")
    return exp


@router.get("/experiments")
def list_experiments() -> dict[str, Any]:
    return {"experiments": db.list_experiments()}


@router.post("/experiments", status_code=201)
def create_experiment(req: ExperimentCreateRequest) -> dict[str, Any]:
    agent = db.get_agent(req.agentId)
    if agent is None:
        raise HTTPException(status_code=404, detail="unknown agent id")
    deployment = agent.get("deployment") or {}
    if deployment.get("status") != "deployed":
        raise HTTPException(status_code=400, detail="agent is not deployed")
    experiment_id = uuid.uuid4().hex[:12]
    db.create_experiment(
        experiment_id, name=req.name, agent_id=req.agentId, agent_name=agent["name"]
    )
    return _get_or_404(experiment_id)


@router.get("/experiments/{experiment_id}")
def get_experiment(experiment_id: str) -> dict[str, Any]:
    return _get_or_404(experiment_id)


@router.put("/experiments/{experiment_id}")
def update_experiment(experiment_id: str, req: ExperimentUpdateRequest) -> dict[str, Any]:
    _get_or_404(experiment_id)
    if req.stage is not None and req.stage not in EXPERIMENT_STAGES:
        raise HTTPException(status_code=422, detail=f"invalid stage: {req.stage}")
    challenger_name: str | None = None
    if req.challengerAgentId is not None:
        challenger = db.get_agent(req.challengerAgentId)
        if challenger is None:
            raise HTTPException(status_code=404, detail="unknown challenger agent id")
        challenger_name = challenger["name"]
    db.update_experiment(
        experiment_id,
        name=req.name,
        stage=req.stage,
        challenger_agent_id=req.challengerAgentId,
        challenger_agent_name=challenger_name,
        artifacts=req.artifacts,
        error=req.error,
    )
    return _get_or_404(experiment_id)


@router.delete("/experiments/{experiment_id}")
def delete_experiment(experiment_id: str) -> dict[str, Any]:
    _get_or_404(experiment_id)
    db.delete_experiment(experiment_id)
    return {"ok": True}
