"""Agent CRUD + deploy/undeploy (console resources backed by SQLite)."""

from __future__ import annotations

import time
import uuid
from typing import Any

from fastapi import APIRouter, HTTPException

from .. import agentcore, db, deployer, jobs
from ..aws import control, get_session
from ..models import (
    AgentCreateRequest,
    AgentDeployRequest,
    AgentUpdateRequest,
    Creds,
    CredsRequest,
    JobRef,
)

router = APIRouter(prefix="/api", tags=["agents"])


def _get_or_404(agent_id: str) -> dict[str, Any]:
    agent = db.get_agent(agent_id)
    if agent is None:
        raise HTTPException(status_code=404, detail="unknown agent id")
    return agent


@router.get("/agents")
def list_agents() -> dict[str, Any]:
    return {"agents": db.list_agents()}


@router.post("/agents", status_code=201)
def create_agent(req: AgentCreateRequest) -> dict[str, Any]:
    agent_id = uuid.uuid4().hex[:12]
    db.create_agent(
        agent_id,
        name=req.name,
        description=req.description,
        code=req.code,
        requirements=req.requirements,
        config=req.config.model_dump() if req.config else None,
    )
    return _get_or_404(agent_id)


@router.get("/agents/{agent_id}")
def get_agent(agent_id: str) -> dict[str, Any]:
    return _get_or_404(agent_id)


@router.put("/agents/{agent_id}")
def update_agent(agent_id: str, req: AgentUpdateRequest) -> dict[str, Any]:
    _get_or_404(agent_id)
    db.update_agent(
        agent_id,
        name=req.name,
        description=req.description,
        code=req.code,
        requirements=req.requirements,
        config=req.config.model_dump() if req.config else None,
    )
    return _get_or_404(agent_id)


@router.delete("/agents/{agent_id}")
def delete_agent(agent_id: str) -> dict[str, Any]:
    _get_or_404(agent_id)
    db.delete_agent(agent_id)
    return {"ok": True}


@router.post("/agents/{agent_id}/deploy", response_model=JobRef)
def deploy_agent(agent_id: str, req: AgentDeployRequest) -> JobRef:
    """Deploy the agent's code as an AgentCore runtime (background job)."""
    agent = _get_or_404(agent_id)
    runtime_name = deployer.sanitize_runtime_name(agent["name"])

    # An explicit region override wins over the creds region (get_session
    # resolves creds.region → DEFAULT_REGION otherwise).
    creds = req.creds.model_copy() if req.creds else Creds()
    if req.region:
        creds.region = req.region

    def _run(progress: Any) -> dict[str, Any]:
        db.update_agent_deployment(agent_id, {"status": "deploying"})
        try:
            deployment = deployer.deploy_agent_code(
                get_session(creds),
                runtime_name=runtime_name,
                code=agent["code"],
                extra_requirements=agent["requirements"],
                progress=progress,
            )
        except Exception as exc:
            db.update_agent_deployment(
                agent_id, {"status": "failed", "error": f"{type(exc).__name__}: {exc}"}
            )
            raise
        deployment["status"] = "deployed"
        deployment["deployedAt"] = time.time()
        db.update_agent_deployment(agent_id, deployment)
        return deployment

    return JobRef(jobId=jobs.start_job(_run))


@router.post("/agents/{agent_id}/undeploy", response_model=JobRef)
def undeploy_agent(agent_id: str, req: CredsRequest) -> JobRef:
    """Delete the agent's runtime + execution role, clear deployment state."""
    agent = _get_or_404(agent_id)
    deployment = agent.get("deployment") or {}
    runtime_id = deployment.get("runtimeId")
    role_name = deployment.get("roleName")

    def _run(progress: Any) -> dict[str, Any]:
        progress("Deleting runtime + execution role")
        session = get_session(req.creds)
        results = agentcore.cleanup_resources(
            control(session),
            None,
            runtime_ids=[runtime_id] if runtime_id else [],
            role_name=role_name,
            iam_client=session.client("iam") if role_name else None,
        )
        db.update_agent_deployment(agent_id, None)
        return {"results": results}

    return JobRef(jobId=jobs.start_job(_run))
