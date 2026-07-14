"""Pydantic request/response models shared across routers."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field, model_validator


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


class InvokeConfig(BaseModel):
    """How to send dataset traffic to an external agent over HTTP.

    ``payloadTemplate`` carries literal ``{prompt}`` / ``{sessionId}`` tokens
    that are replaced with JSON-encoded values at invocation time. Header
    values may include user-supplied auth tokens — they are stored in the
    local SQLite DB (never logged), unlike AWS creds which are never stored.
    """

    url: str
    method: Literal["POST"] = "POST"
    payloadTemplate: str = '{"prompt": {prompt}, "sessionId": {sessionId}}'
    sessionHeader: str = "X-Session-Id"
    headers: dict[str, str] = Field(default_factory=dict)
    timeoutSeconds: int = 60


class AgentBinding(BaseModel):
    """Telemetry binding for an external agent: where its OTEL traces land.

    ``serviceName`` is the agent's OTEL ``service.name``; ``logGroup`` is the
    CloudWatch log group named in ``aws.log.group.names``. Evaluations read
    spans from ``aws/spans`` + this log group — no AgentCore runtime needed.
    """

    serviceName: str
    logGroup: str
    region: str | None = None
    invoke: InvokeConfig | None = None


class AgentCreateRequest(BaseModel):
    name: str
    description: str = ""
    # External agents carry no code — they are registered, not deployed.
    code: str = ""
    # Extra pip requirements appended to the fixed base set at deploy time.
    requirements: list[str] = Field(default_factory=list)
    config: AgentConfig | None = None
    kind: Literal["managed", "external"] = "managed"
    binding: AgentBinding | None = None


class AgentUpdateRequest(BaseModel):
    """Partial update — only provided fields change (kind is immutable)."""

    name: str | None = None
    description: str | None = None
    code: str | None = None
    requirements: list[str] | None = None
    config: AgentConfig | None = None
    binding: AgentBinding | None = None


class AgentDeployRequest(CredsRequest):
    region: str | None = None


class TelemetryCheckRequest(CredsRequest):
    """Probe CloudWatch for an agent's spans over a lookback window."""

    lookbackHours: int = 24


# ─── Scenario datasets (AgentCore Dataset evaluation / User simulation) ─────
# Field names mirror the devguide dataset schema verbatim (snake_case), so
# scenarios copy-paste between this console and the AgentCore SDK.
DatasetKind = Literal["legacy", "predefined", "simulated"]


class ScenarioTurn(BaseModel):
    """One turn of a predefined scenario."""

    model_config = {"extra": "forbid"}

    input: str = Field(min_length=1)
    expected_response: str | None = None


class ActorProfile(BaseModel):
    """Who the simulated user is and what it wants to achieve."""

    model_config = {"extra": "forbid"}

    context: str = Field(min_length=1)
    goal: str = Field(min_length=1)
    traits: dict[str, str] = Field(default_factory=dict)


class PredefinedScenario(BaseModel):
    """Fixed sequence of turns, replayed exactly as written."""

    model_config = {"extra": "forbid"}

    scenario_id: str = Field(min_length=1)
    turns: list[ScenarioTurn] = Field(min_length=1)
    expected_trajectory: list[str] | None = None
    assertions: list[str] | None = None
    metadata: dict[str, Any] | None = None


class SimulatedScenario(BaseModel):
    """LLM-actor-driven scenario. No expected_trajectory / per-turn
    expected_response — the conversation flow is not known in advance."""

    model_config = {"extra": "forbid"}

    scenario_id: str = Field(min_length=1)
    scenario_description: str = ""
    actor_profile: ActorProfile
    input: str = Field(min_length=1)
    max_turns: int = Field(default=10, ge=1, le=20)
    assertions: list[str] | None = None
    metadata: dict[str, Any] | None = None


def _validate_scenarios(kind: str, items: list[dict[str, Any]]) -> None:
    """Validate scenario payloads for the non-legacy dataset kinds."""
    model = PredefinedScenario if kind == "predefined" else SimulatedScenario
    for item in items:
        model.model_validate(item)


class DatasetCreateRequest(BaseModel):
    name: str
    description: str = ""
    kind: DatasetKind = "legacy"
    # legacy → items; predefined/simulated → scenarios (devguide schema).
    items: list[DatasetItem] | None = None
    scenarios: list[dict[str, Any]] | None = None

    @model_validator(mode="after")
    def _check_payload(self) -> DatasetCreateRequest:
        if self.kind == "legacy":
            if not self.items:
                raise ValueError("legacy datasets require non-empty items")
        else:
            if not self.scenarios:
                raise ValueError(f"{self.kind} datasets require non-empty scenarios")
            _validate_scenarios(self.kind, self.scenarios)
        return self


class DatasetUpdateRequest(BaseModel):
    """Partial update — only provided fields change (kind is immutable)."""

    name: str | None = None
    description: str | None = None
    items: list[DatasetItem] | None = None
    scenarios: list[dict[str, Any]] | None = None


class RunCreateRequest(CredsRequest):
    """Evaluation run. Scope with EXACTLY ONE of:
    * ``datasetId``      — active: invoke the agent per item, then evaluate.
    * ``lookbackHours``  — passive: evaluate existing traffic in a time window.
    * ``sessionIds``     — passive: evaluate these exact sessions.
    """

    agentId: str
    datasetId: str | None = None
    lookbackHours: int | None = None
    sessionIds: list[str] | None = None
    # Evaluator IDs (built-in "Builtin.X" and/or custom ids). None → default trio.
    evaluators: list[str] | None = None
    # Traces need time to land in CloudWatch before batch evaluation can see them.
    waitSeconds: int = 90
    # Actor model for user-simulation datasets (Bedrock model id). None → default.
    simulationModelId: str | None = None


class InsightReportCreateRequest(CredsRequest):
    """One-time insights analysis. Scope the sessions with EITHER a past run
    (its sessionIds) OR a lookback window over the agent's recent traffic."""

    agentId: str
    # Insight IDs (Builtin.Insight.*). None → all three.
    insights: list[str] | None = None
    # Session scope — exactly one of:
    runId: str | None = None
    lookbackHours: int | None = None


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

# Which A/B pattern an experiment runs. config_bundle = one shared runtime,
# variantConfiguration.configurationBundle. target_based = two endpoints,
# variantConfiguration.target + perVariantOnlineEvaluationConfig + gatewayFilter.
EXPERIMENT_KINDS = ("config_bundle", "target_based")


class ExperimentCreateRequest(BaseModel):
    name: str
    agentId: str
    # Literal makes an out-of-set kind a 422 at request validation.
    kind: Literal["config_bundle", "target_based"] = "config_bundle"


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
