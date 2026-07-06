"""Pydantic request/response models shared across routers."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


class Creds(BaseModel):
    """Optional per-session AWS credentials. When absent/partial, the backend
    falls back to the default provider chain (EC2 IAM role). Never persisted."""

    accessKeyId: str | None = None
    secretAccessKey: str | None = None
    sessionToken: str | None = None
    region: str | None = None


class CredsRequest(BaseModel):
    """Base for any request that may carry optional creds."""

    creds: Creds | None = None


class IdentityResponse(BaseModel):
    ok: bool
    account: str | None = None
    arn: str | None = None
    region: str | None = None
    error: str | None = None


JobState = Literal["pending", "running", "completed", "failed"]


class JobRef(BaseModel):
    jobId: str


class JobStatus(BaseModel):
    id: str
    state: JobState
    result: Any | None = None
    error: str | None = None
    # Optional human-readable progress line (e.g. current poll status).
    progress: str | None = None


# ─── Bundle models ──────────────────────────────────────────────────────────
class BundleCreateRequest(CredsRequest):
    agentArn: str
    name: str
    systemPrompt: str
    toolDescriptions: dict[str, str] = Field(default_factory=dict)
    commitMessage: str = "configuration"


class BundleConfig(BaseModel):
    systemPrompt: str
    toolDescriptions: dict[str, str] = Field(default_factory=dict)


class BundleCompareRequest(BaseModel):
    a: BundleConfig
    b: BundleConfig


# ─── Traffic ────────────────────────────────────────────────────────────────
class TrafficPrompt(BaseModel):
    # `context` is a generic optional prefix (e.g. "Employee ID: EMP-001.").
    # `employeeId` is kept for the legacy wizard payloads.
    employeeId: str | None = None
    context: str | None = None
    prompt: str


def format_prompt(
    prompt: str, *, context: str | None = None, employee_id: str | None = None
) -> str:
    """Build the full prompt: generic context prefix wins, then the legacy
    employee-ID convention, then the bare prompt."""
    if context:
        return f"{context} {prompt}"
    if employee_id:
        return f"Employee ID: {employee_id}. {prompt}"
    return prompt


class TrafficRequest(CredsRequest):
    agentArn: str
    prompts: list[TrafficPrompt]
    bundleArn: str | None = None
    bundleVersion: str | None = None


class GatewayTrafficRequest(CredsRequest):
    """Traffic sent THROUGH the gateway (A/B routed) rather than direct to a runtime."""

    gatewayId: str
    targetName: str = "HRAgentV1"
    prompts: list[TrafficPrompt]


# ─── Deploy ─────────────────────────────────────────────────────────────────
class DeployRequest(CredsRequest):
    name: str
    region: str | None = None
    version: Literal["v1", "v2"] = "v1"


# ─── Console resources: agents, datasets, runs ─────────────────────────────
class DatasetItem(BaseModel):
    prompt: str
    context: str | None = None


class AgentConfig(BaseModel):
    """The runtime-overridable configuration (read by recommendations and
    config bundles). The agent code must read it via
    BedrockAgentCoreContext.get_config_bundle() for bundles to take effect."""

    systemPrompt: str = ""
    toolDescriptions: dict[str, str] = Field(default_factory=dict)


class AgentCreateRequest(BaseModel):
    name: str
    description: str = ""
    code: str
    # Extra pip requirements appended to the fixed base set at deploy time.
    requirements: list[str] = Field(default_factory=list)
    config: AgentConfig | None = None


class AgentUpdateRequest(BaseModel):
    """Partial update — only provided fields change."""

    name: str | None = None
    description: str | None = None
    code: str | None = None
    requirements: list[str] | None = None
    config: AgentConfig | None = None


class AgentDeployRequest(CredsRequest):
    region: str | None = None


class DatasetCreateRequest(BaseModel):
    name: str
    description: str = ""
    items: list[DatasetItem]


class DatasetUpdateRequest(BaseModel):
    """Partial update — only provided fields change."""

    name: str | None = None
    description: str | None = None
    items: list[DatasetItem] | None = None


class RunCreateRequest(CredsRequest):
    agentId: str
    datasetId: str
    # Evaluator IDs (built-in "Builtin.X" and/or custom ids). None → default trio.
    evaluators: list[str] | None = None
    # Traces need time to land in CloudWatch before batch evaluation can see them.
    waitSeconds: int = 90


# Ordered stages of an optimization experiment ("furthest reached" pointer).
EXPERIMENT_STAGES = (
    "recommend",
    "bundles",
    "abtest",
    "monitor",
    "promoted",
    "canary",
    "canary_monitor",
    "done",
)


class ExperimentCreateRequest(BaseModel):
    name: str
    agentId: str


class ExperimentUpdateRequest(BaseModel):
    """Partial update. ``artifacts`` is shallow-merged server-side."""

    name: str | None = None
    stage: str | None = None
    challengerAgentId: str | None = None
    artifacts: dict[str, Any] | None = None
    error: str | None = None


# ─── Evaluation & recommendation ────────────────────────────────────────────
class EvaluateRequest(CredsRequest):
    batchName: str
    serviceName: str
    logGroups: list[str]
    sessionIds: list[str] | None = None
    # Evaluator IDs to run: built-in ("Builtin.X") and/or custom evaluator ids.
    # None → the default trio (GoalSuccessRate, Helpfulness, Correctness).
    evaluators: list[str] | None = None


class RatingScalePoint(BaseModel):
    value: float
    label: str
    definition: str


class CreateEvaluatorRequest(CredsRequest):
    name: str
    instructions: str
    ratingScale: list[RatingScalePoint]
    modelId: str
    level: Literal["TOOL_CALL", "TRACE", "SESSION"] = "TRACE"
    description: str = ""


class SystemPromptRecRequest(CredsRequest):
    name: str
    systemPrompt: str
    logGroupArns: list[str]
    serviceNames: list[str]


class ToolDescRecRequest(CredsRequest):
    name: str
    tools: list[dict[str, str]]  # [{toolName, description}]
    logGroupArns: list[str]
    serviceNames: list[str]


# ─── A/B tests & cleanup ────────────────────────────────────────────────────
class GatewaySetupRequest(CredsRequest):
    name: str
    roleArn: str
    agentArn: str
    targetName: str = "HRAgentV1"
    onlineEvalName: str
    logGroup: str
    serviceName: str
    # Optional gateway description; a generic default is derived from the name.
    description: str = ""


class ConfigBundleABRequest(CredsRequest):
    name: str
    gatewayArn: str
    roleArn: str
    onlineEvalArn: str
    controlBundleArn: str
    controlVersion: str
    treatmentBundleArn: str
    treatmentVersion: str


class TargetABRequest(CredsRequest):
    name: str
    gatewayArn: str
    roleArn: str
    targetNameV1: str
    targetNameV2: str
    onlineEvalArnV1: str
    onlineEvalArnV2: str


class TargetSetupRequest(CredsRequest):
    """Step 8b–d orchestration: add v2 target + v2 online-eval, stop the bundle
    A/B test, then create the target A/B test (reuses the step-7 gateway)."""

    name: str
    gatewayId: str
    gatewayArn: str
    roleArn: str
    agentArnV2: str
    targetNameV1: str = "HRAgentV1"
    targetNameV2: str = "HRAgentV2"
    onlineEvalNameV2: str
    logGroupV2: str
    serviceNameV2: str
    onlineEvalArnV1: str
    bundleAbTestId: str | None = None


class WeightsRequest(CredsRequest):
    controlWeight: int
    treatmentWeight: int
    # For config-bundle variants the frontend passes the bundle refs; for target
    # variants it passes the target names. Kept generic as an opaque variant list.
    variants: list[dict[str, Any]]


class CleanupRequest(CredsRequest):
    abTestIds: list[str] = Field(default_factory=list)
    onlineEvalIds: list[str] = Field(default_factory=list)
    evaluatorIds: list[str] = Field(default_factory=list)
    bundleIds: list[str] = Field(default_factory=list)
    gatewayId: str | None = None
    targetIds: list[str] = Field(default_factory=list)
    runtimeIds: list[str] = Field(default_factory=list)
    roleName: str | None = None
    deliveryId: str | None = None
