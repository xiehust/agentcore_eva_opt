"""Deploy + traffic endpoints (real AgentCore data/control calls)."""

from __future__ import annotations

import json
import uuid
from pathlib import Path
from typing import Any

from fastapi import APIRouter

from .. import agentcore, jobs
from ..aws import data, get_session
from ..lab4_path import ensure_lab4_on_path, find_lab4_dir
from ..models import DeployRequest, JobRef, TrafficRequest, format_prompt

router = APIRouter(prefix="/api", tags=["deploy"])

# The proven Python deployer lives in the sample project (shared locator in
# app.lab4_path). Aliases kept for the existing tests' imports.
_find_lab4_dir = find_lab4_dir
_ensure_lab4_on_path = ensure_lab4_on_path


@router.post("/deploy", response_model=JobRef)
def deploy(req: DeployRequest) -> JobRef:
    """Start a real deploy as a background job. Returns a jobId to poll."""

    def _run(progress: Any) -> dict[str, Any]:
        progress(f"Importing deployer for {req.name} ({req.version})")
        _ensure_lab4_on_path()
        import deploy_agent  # type: ignore[import-not-found]

        progress("Building + deploying agent runtime (Docker, may take minutes)")
        state_path = deploy_agent.main(
            name=req.name, region=req.region, version=req.version
        )
        state = json.loads(Path(state_path).read_text())
        progress("Runtime ACTIVE")
        return {
            "runtime_arn": state.get("runtime_arn"),
            "runtime_id": state.get("runtime_id"),
            "log_group": state.get("log_group"),
            "service_name": state.get("service_name"),
            "role_arn": state.get("role_arn"),
            "region": state.get("region"),
        }

    return JobRef(jobId=jobs.start_job(_run))


@router.post("/traffic", response_model=JobRef)
def traffic(req: TrafficRequest) -> JobRef:
    """Send prompts to the runtime (optionally with a config-bundle baggage header)."""
    baggage = None
    if req.bundleArn and req.bundleVersion:
        baggage = agentcore.config_bundle_baggage(req.bundleArn, req.bundleVersion)

    def _run(progress: Any) -> dict[str, Any]:
        session = get_session(req.creds)
        client = data(session)
        sent: list[dict[str, str]] = []
        for i, p in enumerate(req.prompts):
            sid = str(uuid.uuid4())
            full = format_prompt(p.prompt, context=p.context, employee_id=p.employeeId)
            agentcore.invoke_agent_runtime(
                client,
                agent_arn=req.agentArn,
                session_id=sid,
                prompt=full,
                baggage=baggage,
            )
            sent.append({"sessionId": sid, "prompt": full})
            progress(f"sent {i + 1}/{len(req.prompts)}")
        return {"sessionIds": [s["sessionId"] for s in sent], "count": len(sent)}

    return JobRef(jobId=jobs.start_job(_run))
