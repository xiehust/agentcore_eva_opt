"""A/B test endpoints: config-bundle routing, target-based routing, monitor, weights."""

from __future__ import annotations

import time
from typing import Any

from fastapi import APIRouter

from .. import agentcore, jobs
from ..aws import control, data, get_session
from ..models import (
    ConfigBundleABRequest,
    GatewaySetupRequest,
    GatewayTrafficRequest,
    JobRef,
    TargetABRequest,
    TargetSetupRequest,
    WeightsRequest,
    format_prompt,
)

router = APIRouter(prefix="/api", tags=["abtest"])


def _is_conflict(exc: Exception) -> bool:
    """True for botocore ConflictException (matched by name — works for fakes too)."""
    return type(exc).__name__ == "ConflictException"


def _resolve_role_arn(req: GatewaySetupRequest, cc: Any) -> str:
    """Return the explicit roleArn, or fall back to the runtime's execution role.

    The frontend may not have the role ARN (e.g. session restored from an older
    deploy) — an empty string would fail CreateGateway validation, so look it up
    from the agent runtime instead.
    """
    if req.roleArn:
        return req.roleArn
    runtime_id = req.agentArn.rsplit("/", 1)[-1]
    runtime = cc.get_agent_runtime(agentRuntimeId=runtime_id)
    role_arn = runtime.get("roleArn", "")
    if not role_arn:
        raise ValueError(
            f"No roleArn provided and runtime {runtime_id} has no execution role"
        )
    return role_arn


def _create_gateway_target_idempotent(
    cc: Any, gateway_id: str, name: str, agent_arn: str, progress: Any
) -> str:
    """Create an http→agentcoreRuntime gateway target; adopt existing on conflict."""
    try:
        tgt = cc.create_gateway_target(
            gatewayIdentifier=gateway_id,
            name=name,
            targetConfiguration={
                "http": {"agentcoreRuntime": {"arn": agent_arn, "qualifier": "DEFAULT"}}
            },
            credentialProviderConfigurations=[
                {"credentialProviderType": "GATEWAY_IAM_ROLE"}
            ],
            clientToken=str(agentcore.uuid.uuid4()),
        )
        return tgt["targetId"]
    except Exception as exc:
        if not _is_conflict(exc):
            raise
        progress(f"gateway target {name} exists — reusing")
        existing = [
            t
            for t in cc.list_gateway_targets(gatewayIdentifier=gateway_id).get(
                "items", []
            )
            if t.get("name") == name
        ]
        if not existing:
            raise
        return existing[0]["targetId"]


def _create_online_eval_idempotent(
    cc: Any,
    *,
    name: str,
    log_group: str,
    service_name: str,
    role_arn: str,
    progress: Any,
    description: str = "",
) -> dict[str, Any]:
    """Create an online-evaluation config; adopt existing by name on conflict."""
    try:
        return cc.create_online_evaluation_config(
            onlineEvaluationConfigName=name,
            description=description or f"Online evaluation for {name}",
            dataSourceConfig={
                "cloudWatchLogs": {
                    "logGroupNames": [log_group],
                    "serviceNames": [service_name],
                }
            },
            evaluators=[
                {"evaluatorId": "Builtin.GoalSuccessRate"},
                {"evaluatorId": "Builtin.Helpfulness"},
            ],
            rule={
                "samplingConfig": {"samplingPercentage": 100.0},
                "sessionConfig": {"sessionTimeoutMinutes": 2},
            },
            evaluationExecutionRoleArn=role_arn,
            enableOnCreate=True,
            clientToken=str(agentcore.uuid.uuid4()),
        )
    except Exception as exc:
        if not _is_conflict(exc):
            raise
        progress(f"online eval config {name} exists — reusing")
        existing = [
            c
            for c in cc.list_online_evaluation_configs().get(
                "onlineEvaluationConfigs", []
            )
            if c.get("onlineEvaluationConfigName") == name
        ]
        if not existing:
            raise
        return existing[0]


def _gateway_setup_run(req: GatewaySetupRequest, cc: Any, progress: Any) -> dict[str, Any]:
    """Create gateway + v1 target + online-eval, polling each to READY."""
    role_arn = _resolve_role_arn(req, cc)
    progress("creating gateway")
    try:
        # clientToken must be ≥33 chars — str(uuid4()) is 36; uuid4().hex (32) fails.
        # No protocolType: the service default supports HTTP runtime targets;
        # passing "MCP" would reject the http target below. (Requires botocore
        # ≥1.43 — the project venv — where protocolType is optional.)
        gw = cc.create_gateway(
            name=req.name,
            description=req.description or f"A/B test gateway for {req.name}",
            authorizerType="AWS_IAM",
            roleArn=role_arn,
            clientToken=str(agentcore.uuid.uuid4()),
        )
        gateway_id = gw["gatewayId"]
    except Exception as exc:
        if not _is_conflict(exc):
            raise
        # Re-run after a partial setup: adopt the existing gateway by name.
        progress("gateway exists — reusing")
        existing = [
            g
            for g in cc.list_gateways().get("items", [])
            if g.get("name") == req.name
        ]
        if not existing:
            raise
        gateway_id = existing[0]["gatewayId"]
    gateway_arn = ""
    for _ in range(30):
        g = cc.get_gateway(gatewayIdentifier=gateway_id)
        progress(f"gateway {g.get('status')}")
        if g.get("status") == "READY":
            gateway_arn = g.get("gatewayArn", gateway_arn)
            break
        time.sleep(5)
    progress("creating gateway target")
    target_id = _create_gateway_target_idempotent(
        cc, gateway_id, req.targetName, req.agentArn, progress
    )
    progress("creating online eval config")
    oe = _create_online_eval_idempotent(
        cc,
        name=req.onlineEvalName,
        log_group=req.logGroup,
        service_name=req.serviceName,
        role_arn=role_arn,
        progress=progress,
    )
    return {
        "gatewayId": gateway_id,
        "gatewayArn": gateway_arn,
        "targetId": target_id,
        "onlineEvalArn": oe.get("onlineEvaluationConfigArn"),
        "onlineEvalId": oe.get("onlineEvaluationConfigId"),
        "roleArn": role_arn,
    }


@router.post("/gateway/setup", response_model=JobRef)
def gateway_setup(req: GatewaySetupRequest) -> JobRef:
    """Create gateway + v1 target + online-eval, polling each to READY.

    Returns a job whose result is
    {gatewayId, gatewayArn, targetId, onlineEvalArn, roleArn}.
    """

    def _run(progress):  # type: ignore[no-untyped-def]
        cc = control(get_session(req.creds))
        return _gateway_setup_run(req, cc, progress)

    return JobRef(jobId=jobs.start_job(_run))


def _create_ab_test_idempotent(client: Any, **kwargs: Any) -> dict[str, Any]:
    """create_ab_test, adopting the existing test by name on ConflictException.

    Lets a retried step 7/8 setup succeed after a partial earlier run. AWS
    stores A/B test names lowercased, so match case-insensitively.
    """
    try:
        return agentcore.create_ab_test(client, **kwargs)
    except Exception as exc:
        if not _is_conflict(exc):
            raise
        wanted = kwargs.get("name", "").lower()
        existing = [
            t
            for t in client.list_ab_tests().get("abTests", [])
            if t.get("name", "").lower() == wanted
        ]
        if not existing:
            raise
        return existing[0]


def _resolve_bundle_arn(cc: Any, ref: str) -> str:
    """Accept a full configuration-bundle ARN or a bare bundle ID.

    The frontend persists only bundle IDs (Step 6), but CreateABTest validates
    variants against the full ARN pattern — so bare IDs are looked up here.
    """
    if not ref:
        raise ValueError("missing configuration bundle id/arn")
    if ref.startswith("arn:"):
        return ref
    bundle = cc.get_configuration_bundle(bundleId=ref)
    arn = bundle.get("bundleArn", "")
    if not arn:
        raise ValueError(f"configuration bundle {ref} has no ARN")
    return arn


def _gateway_traffic_run(
    req: GatewayTrafficRequest,
    cc: Any,
    credentials: Any,
    region: str,
    poster: Any,
    signer: Any,
    progress: Any,
) -> dict[str, Any]:
    """POST each prompt through the gateway's /{target}/invocations URL.

    Traffic must enter via the gateway for the A/B test to route and collect
    sessions — invoke_agent_runtime hits the runtime directly and bypasses it.
    poster(url, content=..., headers=...) and signer(creds, region, AWSRequest)
    are injected for testability.
    """
    import json as _json

    from botocore.awsrequest import AWSRequest

    gw = cc.get_gateway(gatewayIdentifier=req.gatewayId)
    base = gw.get("gatewayUrl") or (
        f"https://{req.gatewayId}.gateway.bedrock-agentcore.{region}.amazonaws.com"
    )
    url = f"{base}/{req.targetName}/invocations"
    session_ids: list[str] = []
    failed = 0
    for i, p in enumerate(req.prompts):
        sid = str(agentcore.uuid.uuid4())
        full = format_prompt(p.prompt, context=p.context, employee_id=p.employeeId)
        body = _json.dumps({"prompt": full, "sessionId": sid})
        aws_req = AWSRequest(
            method="POST",
            url=url,
            data=body,
            headers={
                "Content-Type": "application/json",
                "X-Amzn-Bedrock-AgentCore-Runtime-Session-Id": sid,
            },
        )
        signer(credentials, region, aws_req)
        resp = poster(url, content=body, headers=dict(aws_req.headers))
        if resp.status_code == 200:
            session_ids.append(sid)
        else:
            failed += 1
        progress(f"sent {i + 1}/{len(req.prompts)} ({failed} failed)")
    return {"sessionIds": session_ids, "count": len(session_ids), "failed": failed}


@router.post("/gateway/traffic", response_model=JobRef)
def gateway_traffic(req: GatewayTrafficRequest) -> JobRef:
    """Send prompts through the gateway (SigV4) so the A/B test routes them."""

    def _run(progress):  # type: ignore[no-untyped-def]
        import httpx
        from botocore.auth import SigV4Auth

        session = get_session(req.creds)
        region = session.region_name or "us-west-2"
        credentials = session.get_credentials().get_frozen_credentials()
        cc = control(session)

        def signer(creds, reg, aws_req):  # type: ignore[no-untyped-def]
            SigV4Auth(creds, "bedrock-agentcore", reg).add_auth(aws_req)

        with httpx.Client(timeout=120) as client:

            def poster(url, *, content, headers):  # type: ignore[no-untyped-def]
                return client.post(url, content=content, headers=headers)

            return _gateway_traffic_run(
                req, cc, credentials, region, poster, signer, progress
            )

    return JobRef(jobId=jobs.start_job(_run))


@router.post("/abtest/config-bundle")
def abtest_config_bundle(req: ConfigBundleABRequest) -> dict[str, Any]:
    session = get_session(req.creds)
    client = data(session)
    cc = control(session)
    variants = agentcore.config_bundle_variants(
        _resolve_bundle_arn(cc, req.controlBundleArn),
        req.controlVersion,
        _resolve_bundle_arn(cc, req.treatmentBundleArn),
        req.treatmentVersion,
    )
    resp = _create_ab_test_idempotent(
        client,
        name=req.name,
        gatewayArn=req.gatewayArn,
        roleArn=req.roleArn,
        enableOnCreate=True,
        evaluationConfig={"onlineEvaluationConfigArn": req.onlineEvalArn},
        variants=variants,
    )
    return {"abTestId": resp.get("abTestId"), "variants": variants}


@router.post("/abtest/target")
def abtest_target(req: TargetABRequest) -> dict[str, Any]:
    client = data(get_session(req.creds))
    variants = agentcore.target_variants(req.targetNameV1, req.targetNameV2)
    resp = _create_ab_test_idempotent(
        client,
        name=req.name,
        gatewayArn=req.gatewayArn,
        roleArn=req.roleArn,
        enableOnCreate=True,
        evaluationConfig={
            "perVariantOnlineEvaluationConfig": [
                {"name": "C", "onlineEvaluationConfigArn": req.onlineEvalArnV1},
                {"name": "T1", "onlineEvaluationConfigArn": req.onlineEvalArnV2},
            ]
        },
        gatewayFilter={"targetPaths": [f"/{req.targetNameV1}/*"]},
        variants=variants,
    )
    return {"abTestId": resp.get("abTestId"), "variants": variants}


def _stop_ab_test_if_running(client: Any, ab_test_id: str, progress: Any) -> None:
    """Only one A/B test may run per gateway — stop the bundle test first.

    Tolerant: a missing/already-stopped test must not fail the setup.
    """
    try:
        ab = client.get_ab_test(abTestId=ab_test_id)
        if ab.get("executionStatus") in ("RUNNING", "PAUSED"):
            progress("stopping config-bundle A/B test")
            client.update_ab_test(abTestId=ab_test_id, executionStatus="STOPPED")
    except Exception as exc:  # noqa: BLE001 — best-effort; setup proceeds regardless
        if not _is_conflict(exc):
            progress(f"stop skipped: {type(exc).__name__}")


def _target_ab_setup_run(
    req: TargetSetupRequest, cc: Any, data_client: Any, progress: Any
) -> dict[str, Any]:
    """Add the v2 target + v2 online-eval, stop the bundle test, create target A/B.

    Reuses the caller-supplied gateway (same gatewayId/Arn). Idempotent: a rerun
    adopts the existing v2 target / eval-config / target A/B test by name.

    Standalone target-based use: when ``req.bundleAbTestId`` is falsy (None/"")
    there is no config-bundle test to stop, so the STOP step is skipped entirely
    and this runs as a self-contained target-based A/B with no dependency on a
    prior config-bundle experiment.
    """
    progress("adding v2 gateway target")
    target_id_v2 = _create_gateway_target_idempotent(
        cc, req.gatewayId, req.targetNameV2, req.agentArnV2, progress
    )
    for _ in range(30):
        t = cc.get_gateway_target(
            gatewayIdentifier=req.gatewayId, targetId=target_id_v2
        )
        progress(f"v2 target {t.get('status')}")
        if t.get("status") == "READY":
            break
        time.sleep(5)
    progress("creating v2 online eval config")
    oe = _create_online_eval_idempotent(
        cc,
        name=req.onlineEvalNameV2,
        log_group=req.logGroupV2,
        service_name=req.serviceNameV2,
        role_arn=req.roleArn,
        progress=progress,
    )
    online_eval_arn_v2 = oe.get("onlineEvaluationConfigArn")
    # Only stop a config-bundle test when one was supplied. Standalone
    # target-based runs pass bundleAbTestId=None → no STOP call at all.
    if req.bundleAbTestId:
        _stop_ab_test_if_running(data_client, req.bundleAbTestId, progress)
    progress("creating target A/B test")
    variants = agentcore.target_variants(req.targetNameV1, req.targetNameV2)
    resp = _create_ab_test_idempotent(
        data_client,
        name=req.name,
        gatewayArn=req.gatewayArn,
        roleArn=req.roleArn,
        enableOnCreate=True,
        evaluationConfig={
            "perVariantOnlineEvaluationConfig": [
                {"name": "C", "onlineEvaluationConfigArn": req.onlineEvalArnV1},
                {"name": "T1", "onlineEvaluationConfigArn": online_eval_arn_v2},
            ]
        },
        gatewayFilter={"targetPaths": [f"/{req.targetNameV1}/*"]},
        variants=variants,
    )
    return {
        "targetIdV2": target_id_v2,
        "onlineEvalArnV2": online_eval_arn_v2,
        # ID (not just ARN) — cleanup deletes online-eval configs by id.
        "onlineEvalIdV2": oe.get("onlineEvaluationConfigId"),
        "abTestId": resp.get("abTestId"),
    }


@router.post("/abtest/target-setup", response_model=JobRef)
def abtest_target_setup(req: TargetSetupRequest) -> JobRef:
    """Step 8b–d: add v2 target + eval, stop the bundle test, create target A/B.

    Returns a job whose result is {targetIdV2, onlineEvalArnV2, abTestId}.
    """

    def _run(progress):  # type: ignore[no-untyped-def]
        session = get_session(req.creds)
        return _target_ab_setup_run(req, control(session), data(session), progress)

    return JobRef(jobId=jobs.start_job(_run))


@router.get("/abtest/{ab_test_id}")
def monitor(ab_test_id: str) -> dict[str, Any]:
    client = data(get_session(None))
    result = agentcore.get_ab_test(client, ab_test_id=ab_test_id)
    return {
        "abTestId": ab_test_id,
        "status": result.get("status"),
        "executionStatus": result.get("executionStatus"),
        "analysisTimestamp": result.get("results", {}).get("analysisTimestamp"),
        "metrics": agentcore.normalize_ab_results(result),
    }


@router.post("/abtest/{ab_test_id}/weights")
def set_weights(ab_test_id: str, req: WeightsRequest) -> dict[str, Any]:
    """Update variant weights. The service only allows config updates while
    PAUSED or NOT_STARTED, so pause a RUNNING test first (polling until the
    pause lands — it's asynchronous) and resume after."""
    client = data(get_session(req.creds))
    current = agentcore.get_ab_test(client, ab_test_id=ab_test_id)
    was_running = current.get("executionStatus") == "RUNNING"
    if was_running:
        client.update_ab_test(abTestId=ab_test_id, executionStatus="PAUSED")
        for _ in range(30):
            st = agentcore.get_ab_test(client, ab_test_id=ab_test_id)
            if st.get("executionStatus") == "PAUSED":
                break
            time.sleep(2)
    try:
        resp = agentcore.update_ab_test_weights(
            client, ab_test_id=ab_test_id, variants=req.variants
        )
    finally:
        if was_running:
            client.update_ab_test(abTestId=ab_test_id, executionStatus="RUNNING")
    return {"abTestId": ab_test_id, "updated": True, "status": resp.get("status")}
