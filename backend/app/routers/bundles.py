"""Configuration-bundle endpoints (create / read / update / compare)."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel

from .. import agentcore
from ..aws import control, get_session
from ..models import BundleCompareRequest, BundleCreateRequest, CredsRequest

router = APIRouter(prefix="/api", tags=["bundles"])


class BundleUpdateRequest(CredsRequest):
    agentArn: str
    systemPrompt: str
    toolDescriptions: dict[str, str] = {}
    parentVersionIds: list[str] = []
    commitMessage: str = "promote"


class BundleResponse(BaseModel):
    bundleId: str
    versionId: str
    bundleArn: str | None = None


@router.post("/bundles", response_model=BundleResponse)
def create_bundle(req: BundleCreateRequest) -> BundleResponse:
    client = control(get_session(req.creds))
    resp = agentcore.create_configuration_bundle(
        client,
        agent_arn=req.agentArn,
        bundle_name=req.name,
        system_prompt=req.systemPrompt,
        tool_descriptions=req.toolDescriptions,
        commit_message=req.commitMessage,
    )
    return BundleResponse(
        bundleId=resp["bundleId"],
        versionId=resp["versionId"],
        bundleArn=resp.get("bundleArn"),
    )


@router.get("/bundles/{bundle_id}")
def read_bundle(bundle_id: str) -> dict[str, Any]:
    client = control(get_session(None))
    return agentcore.get_configuration_bundle(client, bundle_id=bundle_id)


@router.post("/bundles/{bundle_id}/version", response_model=BundleResponse)
def update_bundle(bundle_id: str, req: BundleUpdateRequest) -> BundleResponse:
    client = control(get_session(req.creds))
    resp = agentcore.update_configuration_bundle(
        client,
        agent_arn=req.agentArn,
        bundle_id=bundle_id,
        system_prompt=req.systemPrompt,
        tool_descriptions=req.toolDescriptions,
        parent_version_ids=req.parentVersionIds,
        commit_message=req.commitMessage,
    )
    return BundleResponse(
        bundleId=resp.get("bundleId", bundle_id),
        versionId=resp["versionId"],
        bundleArn=resp.get("bundleArn"),
    )


@router.post("/bundles/compare")
def compare_bundles(req: BundleCompareRequest) -> dict[str, Any]:
    return agentcore.diff_configs(
        req.a.systemPrompt,
        req.a.toolDescriptions,
        req.b.systemPrompt,
        req.b.toolDescriptions,
    )
