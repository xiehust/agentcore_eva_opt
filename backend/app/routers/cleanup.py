"""Cleanup endpoint — delete every resource created by a live run, resiliently."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter

from .. import agentcore
from ..aws import control, data, get_session, logs
from ..models import CleanupRequest

router = APIRouter(prefix="/api", tags=["cleanup"])


@router.post("/cleanup")
def cleanup(req: CleanupRequest) -> dict[str, Any]:
    session = get_session(req.creds)
    results = agentcore.cleanup_resources(
        control(session),
        data(session),
        ab_test_ids=req.abTestIds,
        online_eval_ids=req.onlineEvalIds,
        evaluator_ids=req.evaluatorIds,
        bundle_ids=req.bundleIds,
        gateway_id=req.gatewayId,
        target_ids=req.targetIds,
        runtime_ids=req.runtimeIds,
        role_name=req.roleName,
        delivery_id=req.deliveryId,
        logs_client=logs(session),
        iam_client=session.client("iam"),
    )
    deleted = sum(1 for r in results if r["status"] == "deleted")
    return {"results": results, "deleted": deleted, "total": len(results)}
