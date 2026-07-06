"""Regression tests: gateway setup must send valid CreateGateway parameters.

Guards the ParamValidationError trio from step 7 live mode:
- clientToken must be ≥ 33 chars (uuid4().hex is only 32),
- protocolType is required by current botocore models,
- an empty roleArn must fall back to the runtime's execution role.
"""

from __future__ import annotations

from typing import Any

from app.models import GatewaySetupRequest
from app.routers.abtest import _gateway_setup_run


class ConflictException(Exception):
    """Mimics botocore's ConflictException (matched by class name)."""


class CaptureControl:
    """Fake control-plane client recording every call's kwargs.

    Set ``conflict`` to a set of create-call names that should raise
    ConflictException (simulating leftovers from a previous partial run).
    """

    def __init__(self, conflict: set[str] | None = None) -> None:
        self.calls: list[tuple[str, dict[str, Any]]] = []
        self.conflict = conflict or set()

    def _maybe_conflict(self, name: str) -> None:
        if name in self.conflict:
            raise ConflictException(f"A resource for {name} already exists")

    def get_agent_runtime(self, **kwargs: Any) -> dict[str, Any]:
        self.calls.append(("get_agent_runtime", kwargs))
        return {"roleArn": "arn:aws:iam::434444145045:role/BedrockAgentCore-HRAssistV1"}

    def create_gateway(self, **kwargs: Any) -> dict[str, Any]:
        self.calls.append(("create_gateway", kwargs))
        self._maybe_conflict("create_gateway")
        return {"gatewayId": "gw-1", "gatewayArn": "arn:gw"}

    def list_gateways(self, **kwargs: Any) -> dict[str, Any]:
        self.calls.append(("list_gateways", kwargs))
        return {
            "items": [
                {"gatewayId": "gw-other", "name": "SomethingElse"},
                {"gatewayId": "gw-existing", "name": "HRGatewayabc"},
            ]
        }

    def get_gateway(self, **kwargs: Any) -> dict[str, Any]:
        self.calls.append(("get_gateway", kwargs))
        return {"status": "READY", "gatewayArn": "arn:gw"}

    def create_gateway_target(self, **kwargs: Any) -> dict[str, Any]:
        self.calls.append(("create_gateway_target", kwargs))
        self._maybe_conflict("create_gateway_target")
        return {"targetId": "tgt-1"}

    def list_gateway_targets(self, **kwargs: Any) -> dict[str, Any]:
        self.calls.append(("list_gateway_targets", kwargs))
        return {"items": [{"targetId": "tgt-existing", "name": "HRAgentV1"}]}

    def create_online_evaluation_config(self, **kwargs: Any) -> dict[str, Any]:
        self.calls.append(("create_online_evaluation_config", kwargs))
        self._maybe_conflict("create_online_evaluation_config")
        return {
            "onlineEvaluationConfigArn": "arn:oe",
            "onlineEvaluationConfigId": "oe-1",
        }

    def list_online_evaluation_configs(self, **kwargs: Any) -> dict[str, Any]:
        self.calls.append(("list_online_evaluation_configs", kwargs))
        return {
            "onlineEvaluationConfigs": [
                {
                    "onlineEvaluationConfigId": "oe-existing",
                    "onlineEvaluationConfigArn": "arn:oe-existing",
                    "onlineEvaluationConfigName": "HROnlineEvalabc",
                }
            ]
        }


def _req(role_arn: str = "arn:aws:iam::434444145045:role/Explicit") -> GatewaySetupRequest:
    return GatewaySetupRequest(
        name="HRGatewayabc",
        roleArn=role_arn,
        agentArn="arn:aws:bedrock-agentcore:us-west-2:434444145045:runtime/HRAssistV1-abc",
        onlineEvalName="HROnlineEvalabc",
        logGroup="/aws/bedrock-agentcore/runtimes/x",
        serviceName="HRAssistV1abc.DEFAULT",
    )


def _kwargs(cc: CaptureControl, name: str) -> dict[str, Any]:
    return next(k for n, k in cc.calls if n == name)


def test_create_gateway_payload_valid() -> None:
    cc = CaptureControl()
    _gateway_setup_run(_req(), cc, lambda _m: None)
    gw = _kwargs(cc, "create_gateway")
    # protocolType must be OMITTED: "MCP" (the only enum value) rejects the
    # http runtime target; the service default supports it. Requires botocore
    # ≥1.43 where protocolType is optional.
    assert "protocolType" not in gw
    # API minimum is 33 chars; uuid4().hex (32) used to fail validation.
    assert len(gw["clientToken"]) >= 33
    tgt = _kwargs(cc, "create_gateway_target")
    assert len(tgt["clientToken"]) >= 33
    oe = _kwargs(cc, "create_online_evaluation_config")
    assert len(oe["clientToken"]) >= 33


def test_explicit_role_arn_is_used_verbatim() -> None:
    cc = CaptureControl()
    _gateway_setup_run(_req(), cc, lambda _m: None)
    assert _kwargs(cc, "create_gateway")["roleArn"].endswith("role/Explicit")
    assert not any(n == "get_agent_runtime" for n, _ in cc.calls)


def test_descriptions_are_generic_by_default() -> None:
    """No more hardcoded 'HR Assistant' strings — generic, name-derived defaults."""
    cc = CaptureControl()
    _gateway_setup_run(_req(), cc, lambda _m: None)
    assert "HR Assistant" not in _kwargs(cc, "create_gateway")["description"]
    assert "HR Assistant" not in _kwargs(cc, "create_online_evaluation_config")["description"]


def test_custom_gateway_description_passes_through() -> None:
    cc = CaptureControl()
    req = _req()
    req.description = "Experiment xr123 gateway"
    _gateway_setup_run(req, cc, lambda _m: None)
    assert _kwargs(cc, "create_gateway")["description"] == "Experiment xr123 gateway"


def test_empty_role_arn_falls_back_to_runtime_execution_role() -> None:
    cc = CaptureControl()
    result = _gateway_setup_run(_req(role_arn=""), cc, lambda _m: None)
    lookup = _kwargs(cc, "get_agent_runtime")
    assert lookup == {"agentRuntimeId": "HRAssistV1-abc"}
    resolved = "arn:aws:iam::434444145045:role/BedrockAgentCore-HRAssistV1"
    assert _kwargs(cc, "create_gateway")["roleArn"] == resolved
    assert _kwargs(cc, "create_online_evaluation_config")[
        "evaluationExecutionRoleArn"
    ] == resolved
    # The resolved role is surfaced so the frontend can reuse it for the A/B call.
    assert result["roleArn"] == resolved


def test_rerun_reuses_existing_gateway_on_conflict() -> None:
    """A retried setup must adopt the already-created gateway, not fail."""
    cc = CaptureControl(conflict={"create_gateway"})
    result = _gateway_setup_run(_req(), cc, lambda _m: None)
    # Resolved by name via list_gateways.
    assert result["gatewayId"] == "gw-existing"
    # And setup still proceeds to target + online-eval creation.
    assert any(n == "create_gateway_target" for n, _ in cc.calls)
    assert result["targetId"] == "tgt-1"


def test_rerun_reuses_existing_target_and_eval_on_conflict() -> None:
    cc = CaptureControl(
        conflict={"create_gateway_target", "create_online_evaluation_config"}
    )
    result = _gateway_setup_run(_req(), cc, lambda _m: None)
    assert result["targetId"] == "tgt-existing"
    assert result["onlineEvalArn"] == "arn:oe-existing"
    assert result["onlineEvalId"] == "oe-existing"
