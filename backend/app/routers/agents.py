"""Agent CRUD + deploy/undeploy (console resources backed by SQLite)."""

from __future__ import annotations

import time
import uuid
from typing import Any

from fastapi import APIRouter, HTTPException

from .. import agentcore, db, deployer, jobs, telemetry
from ..aws import control, get_session, logs
from ..models import (
    AgentCreateRequest,
    AgentDeployRequest,
    AgentUpdateRequest,
    Creds,
    CredsRequest,
    JobRef,
    TelemetryCheckRequest,
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


def _validate_binding(binding: Any) -> None:
    """External bindings must name where telemetry lands; invoke URLs must be http(s)."""
    if binding is None:
        raise HTTPException(
            status_code=422,
            detail="external agents require binding.serviceName and binding.logGroup",
        )
    if binding.invoke is not None and not binding.invoke.url.startswith(
        ("http://", "https://")
    ):
        raise HTTPException(
            status_code=422, detail="binding.invoke.url must be an http(s) URL"
        )


@router.post("/agents", status_code=201)
def create_agent(req: AgentCreateRequest) -> dict[str, Any]:
    if req.kind == "external":
        _validate_binding(req.binding)
    agent_id = uuid.uuid4().hex[:12]
    db.create_agent(
        agent_id,
        name=req.name,
        description=req.description,
        code=req.code,
        requirements=req.requirements,
        config=req.config.model_dump() if req.config else None,
        kind=req.kind,
        binding=req.binding.model_dump() if req.binding else None,
    )
    return _get_or_404(agent_id)


@router.get("/agents/{agent_id}")
def get_agent(agent_id: str) -> dict[str, Any]:
    return _get_or_404(agent_id)


@router.put("/agents/{agent_id}")
def update_agent(agent_id: str, req: AgentUpdateRequest) -> dict[str, Any]:
    _get_or_404(agent_id)
    if req.binding is not None:
        _validate_binding(req.binding)
    db.update_agent(
        agent_id,
        name=req.name,
        description=req.description,
        code=req.code,
        requirements=req.requirements,
        config=req.config.model_dump() if req.config else None,
        binding=req.binding.model_dump() if req.binding else None,
    )
    return _get_or_404(agent_id)


@router.delete("/agents/{agent_id}")
def delete_agent(agent_id: str) -> dict[str, Any]:
    _get_or_404(agent_id)
    db.delete_agent(agent_id)
    return {"ok": True}


_EXTERNAL_DEPLOY_DETAIL = (
    "external agents are registered, not deployed — "
    "evaluation reads their existing telemetry"
)


@router.post("/agents/{agent_id}/deploy", response_model=JobRef)
def deploy_agent(agent_id: str, req: AgentDeployRequest) -> JobRef:
    """Deploy the agent's code as an AgentCore runtime (background job)."""
    agent = _get_or_404(agent_id)
    if agent.get("kind") == "external":
        raise HTTPException(status_code=400, detail=_EXTERNAL_DEPLOY_DETAIL)
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


@router.post("/agents/{agent_id}/telemetry-check", response_model=JobRef)
def telemetry_check(agent_id: str, req: TelemetryCheckRequest) -> JobRef:
    """Probe CloudWatch for the agent's spans (background job).

    Verifies telemetry actually lands (aws/spans + session.id) BEFORE any
    evaluation is spent on empty data.
    """
    agent = _get_or_404(agent_id)
    if req.lookbackHours < 1 or req.lookbackHours > 336:
        raise HTTPException(
            status_code=422, detail="lookbackHours must be between 1 and 336"
        )
    try:
        service_name, log_group = telemetry.resolve_telemetry(agent)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    def _run(progress: Any) -> dict[str, Any]:
        progress(f"probing {telemetry.SPANS_LOG_GROUP} for {service_name}")
        client = logs(get_session(req.creds))
        return telemetry.telemetry_report(
            client,
            service_name=service_name,
            log_group=log_group,
            lookback_hours=req.lookbackHours,
        )

    return JobRef(jobId=jobs.start_job(_run))


@router.post("/agents/{agent_id}/undeploy", response_model=JobRef)
def undeploy_agent(agent_id: str, req: CredsRequest) -> JobRef:
    """Delete the agent's runtime + execution role, clear deployment state."""
    agent = _get_or_404(agent_id)
    if agent.get("kind") == "external":
        raise HTTPException(status_code=400, detail=_EXTERNAL_DEPLOY_DETAIL)
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
