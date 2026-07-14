/**
 * Read-only boto3 snippets mirroring the Lab 4 notebook cells. Keyed by the
 * 11 step keys (see steps manifest). Shown in each step's "Code view" so the
 * simulation doubles as an API reference. Faithful to the notebook, trimmed
 * for readability. (datasetEval shows the AgentCore SDK dataset runners.)
 */
export type StepKey =
  | "config"
  | "deploy"
  | "baseline"
  | "eval"
  | "datasetEval"
  | "insights"
  | "recommend"
  | "bundles"
  | "bundleAB"
  | "targetAB"
  | "cleanup";

export const CODE_SNIPPETS: Record<StepKey, string> = {
  config: `import uuid

SUFFIX = uuid.uuid4().hex[:6]   # avoid name collisions across runs
V1_NAME = f"HRAssistV1{SUFFIX}"
V2_NAME = f"HRAssistV2{SUFFIX}"`,

  deploy: `from deploy_agent import main as deploy_agent

# Builds an ARM64 container from hr_assistant_agent.py, creates an IAM
# execution role, uploads to S3, then creates the AgentCore Runtime and
# polls until ACTIVE. State is saved to agent_state_{name}.json.
deploy_agent(name=V1_NAME)

v1_state = json.loads(Path(f"agent_state_{V1_NAME}.json").read_text())
AGENT_ARN = v1_state["runtime_arn"]
LOG_GROUP = v1_state["log_group"]`,

  baseline: `# Create the baseline Configuration Bundle (versioned config keyed by runtime ARN)
baseline = agentcore_control.create_configuration_bundle(
    bundleName=f"HRBaseline{SUFFIX}",
    components={AGENT_ARN: {"configuration": {
        "system_prompt": CURRENT_SYSTEM_PROMPT,
        "tool_descriptions": CURRENT_TOOL_DESCRIPTIONS,
    }}},
    commitMessage="Initial configuration — baseline",
    clientToken=str(uuid.uuid4()),
)

# Send 10 representative HR sessions through the runtime
for emp_id, prompt in BASELINE_PROMPTS:
    agentcore.invoke_agent_runtime(
        agentRuntimeArn=AGENT_ARN,
        runtimeSessionId=str(uuid.uuid4()),
        payload=json.dumps({"prompt": f"Employee ID: {emp_id}. {prompt}"}).encode(),
        baggage=baseline_baggage,
    )`,

  eval: `# Discover sessions from CloudWatch and score them with the selected
# evaluators — any of the 13 built-ins plus custom evaluator ids.
eval_resp = agentcore.start_batch_evaluation(
    batchEvaluationName=f"HRBaseline{SUFFIX}",
    evaluators=[
        {"evaluatorId": "Builtin.GoalSuccessRate"},   # SESSION level
        {"evaluatorId": "Builtin.Helpfulness"},       # TRACE level
        {"evaluatorId": "Builtin.Correctness"},
        # optional extras, e.g.:
        # {"evaluatorId": "Builtin.ToolSelectionAccuracy"},  # TOOL_CALL level
        # {"evaluatorId": custom_evaluator_id},              # LLM-as-a-judge
    ],
    dataSourceConfig={"cloudWatchLogs": {
        "serviceNames": [SERVICE_NAME],
        "logGroupNames": [SPANS_LOG_GROUP, LOG_GROUP],
        "filterConfig": {"sessionIds": baseline_session_ids},
    }},
    clientToken=str(uuid.uuid4()),
)
result = agentcore.get_batch_evaluation(batchEvaluationId=eval_resp["batchEvaluationId"])`,

  datasetEval: `# Dataset evaluation (public preview): a dataset runner drives the whole
# lifecycle — invoke each scenario, wait for telemetry, evaluate.
from bedrock_agentcore.evaluation import (
    BatchEvaluationRunner, BatchEvaluationRunConfig, BatchEvaluatorConfig,
    CloudWatchDataSourceConfig, SimulationConfig,
    Dataset, PredefinedScenario, Turn, SimulatedScenario, ActorProfile,
)

dataset = Dataset(scenarios=[
    # Predefined: fixed turns + ground truth (Correctness / Trajectory* / GSR)
    PredefinedScenario(
        scenario_id="pto-balance-then-request",
        turns=[
            Turn(input="What is my current PTO balance?",
                 expected_response="You have 15 days of PTO remaining."),
            Turn(input="Request leave from 2026-08-04 to 2026-08-08."),
        ],
        expected_trajectory=["get_pto_balance", "submit_pto_request"],
        assertions=["Agent confirms the PTO request dates"],
    ),
    # Simulated: an LLM actor plays the user until its goal is met
    SimulatedScenario(
        scenario_id="frustrated-employee-leave",
        actor_profile=ActorProfile(
            traits={"tone": "frustrated but polite", "patience": "low"},
            context="An employee whose childcare fell through",
            goal="Get a PTO request submitted and confirmed",
        ),
        input="I really need time off next week. Can you help?",
        max_turns=8,
        assertions=["Agent submits a PTO request"],
    ),
])

config = BatchEvaluationRunConfig(
    batch_evaluation_name=f"HRDatasetEval{SUFFIX}",
    evaluator_config=BatchEvaluatorConfig(evaluator_ids=[
        "Builtin.GoalSuccessRate", "Builtin.Correctness",
        "Builtin.TrajectoryExactOrderMatch", "Builtin.Helpfulness",
    ]),
    data_source=CloudWatchDataSourceConfig(
        service_names=[SERVICE_NAME], log_group_names=[LOG_GROUP],
        ingestion_delay_seconds=180,
    ),
    simulation_config=SimulationConfig(       # actor LLM for SimulatedScenario
        model_id="global.anthropic.claude-haiku-4-5-20251001-v1:0",
    ),
)

runner = BatchEvaluationRunner(region=REGION)
result = runner.run_dataset_evaluation(
    config=config, dataset=dataset, agent_invoker=agent_invoker,
)
# result.evaluation_results.evaluator_summaries → per-evaluator averages`,

  insights: `# Insights reuse the batch-evaluation API: pass insights= INSTEAD of
# evaluators= (they are mutually exclusive; max one active job per account).
resp = agentcore.start_batch_evaluation(
    batchEvaluationName=f"HRInsights{SUFFIX}",
    insights=[
        {"insightId": "Builtin.Insight.FailureAnalysis"},   # why it fails
        {"insightId": "Builtin.Insight.UserIntent"},        # what users want
        {"insightId": "Builtin.Insight.ExecutionSummary"},  # how it behaves
    ],
    dataSourceConfig={"cloudWatchLogs": {
        "serviceNames": [SERVICE_NAME],
        "logGroupNames": [SPANS_LOG_GROUP, LOG_GROUP],
        "filterConfig": {"sessionIds": baseline_session_ids},
    }},
    clientToken=str(uuid.uuid4()),
)

result = agentcore.get_batch_evaluation(batchEvaluationId=resp["batchEvaluationId"])
# → failureAnalysisResult.failures[]        categories → subCategories → rootCauses
#     each root cause: {name, recommendation, affectedSessionCount, affectedSessions}
# → userIntentResult.userIntents[]          clustered intents, ranked by frequency
# → executionSummaryResult.executionSummaries[]  behaviour patterns + outcomes`,

  recommend: `# 5a — System prompt recommendation (optimise a target metric from traces)
sp = agentcore.start_recommendation(
    name=f"HRSpRec{SUFFIX}",
    type="SYSTEM_PROMPT_RECOMMENDATION",
    recommendationConfig={"systemPromptRecommendationConfig": {
        "systemPrompt": {"text": CURRENT_SYSTEM_PROMPT},
        "agentTraces": {"cloudwatchLogs": {"logGroupArns": [LOG_GROUP_ARN],
            "serviceNames": [SERVICE_NAME], "startTime": start, "endTime": now}},
        "evaluationConfig": {"evaluators": [
            {"evaluatorArn": "arn:aws:bedrock-agentcore:::evaluator/Builtin.GoalSuccessRate"}]},
    }},
    clientToken=str(uuid.uuid4()),
)

# 5b — Tool description recommendation
td = agentcore.start_recommendation(
    name=f"HRTdRec{SUFFIX}",
    type="TOOL_DESCRIPTION_RECOMMENDATION",
    recommendationConfig={"toolDescriptionRecommendationConfig": {
        "toolDescription": {"toolDescriptionText": {"tools": tools_list}},
        "agentTraces": {"cloudwatchLogs": {"logGroupArns": [LOG_GROUP_ARN],
            "serviceNames": [SERVICE_NAME], "startTime": start, "endTime": now}},
    }},
    clientToken=str(uuid.uuid4()),
)`,

  bundles: `# Control bundle (original config) + Treatment bundle (recommended config)
control = agentcore_control.create_configuration_bundle(
    bundleName=f"HRControl{SUFFIX}",
    components={AGENT_ARN: {"configuration": {
        "system_prompt": CURRENT_SYSTEM_PROMPT,
        "tool_descriptions": CURRENT_TOOL_DESCRIPTIONS}}},
    commitMessage="Control: original (v1 baseline)",
    clientToken=str(uuid.uuid4()),
)
treatment = agentcore_control.create_configuration_bundle(
    bundleName=f"HRTreatment{SUFFIX}",
    components={AGENT_ARN: {"configuration": {
        "system_prompt": RECOMMENDED_SYSTEM_PROMPT,
        "tool_descriptions": RECOMMENDED_TOOL_DESCRIPTIONS}}},
    commitMessage="Treatment: AI-recommended prompt + tool descriptions",
    clientToken=str(uuid.uuid4()),
)

# Read back + compare any two versions
agentcore_control.get_configuration_bundle(bundleId=treatment["bundleId"])
agentcore_control.get_configuration_bundle_version(
    bundleId=control["bundleId"], versionId=control["versionId"])`,

  bundleAB: `# Gateway + target + online eval config, then an A/B test over bundle versions
gw = agentcore_control.create_gateway(name=f"HRGateway{SUFFIX}",
    authorizerType="AWS_IAM", roleArn=ROLE_ARN, clientToken=str(uuid.uuid4()))

ab = agentcore.create_ab_test(
    name=f"HRBundleAB{SUFFIX}",
    gatewayArn=GATEWAY_ARN, roleArn=ROLE_ARN, enableOnCreate=True,
    evaluationConfig={"onlineEvaluationConfigArn": ONLINE_EVAL_ARN},
    variants=[
        {"name": "C", "weight": 50, "variantConfiguration": {"configurationBundle":
            {"bundleArn": CONTROL_BUNDLE_ARN, "bundleVersion": CONTROL_VERSION}}},
        {"name": "T1", "weight": 50, "variantConfiguration": {"configurationBundle":
            {"bundleArn": TREATMENT_BUNDLE_ARN, "bundleVersion": TREATMENT_VERSION}}},
    ],
    clientToken=str(uuid.uuid4()),
)

# After T1 wins: promote by updating the control bundle (records lineage)
agentcore_control.update_configuration_bundle(
    bundleId=CONTROL_BUNDLE_ID,
    components={AGENT_ARN: {"configuration": {
        "system_prompt": RECOMMENDED_SYSTEM_PROMPT,
        "tool_descriptions": RECOMMENDED_TOOL_DESCRIPTIONS}}},
    parentVersionIds=[CONTROL_VERSION],
    commitMessage="Promote treatment (A/B validated)",
    clientToken=str(uuid.uuid4()),
)`,

  targetAB: `# Standalone target-based A/B: its OWN gateway + two runtimes (v1 champion,
# v2 challenger = new escalate_to_hr_manager tool + improved prompt). No config-
# bundle test involved — nothing to stop first.
deploy_agent(name=V2_NAME, version="v2")
gw = agentcore_control.create_gateway(name=f"HRTargetGW{SUFFIX}",
    authorizerType="AWS_IAM", roleArn=ROLE_ARN, clientToken=str(uuid.uuid4()))
for name, arn in (("HRAgentV1", AGENT_ARN_V1), ("HRAgentV2", AGENT_ARN_V2)):
    agentcore_control.create_gateway_target(gatewayIdentifier=gw["gatewayId"],
        name=name, targetConfiguration={"http": {"agentcoreRuntime":
            {"arn": arn, "qualifier": "DEFAULT"}}},
        credentialProviderConfigurations=[{"credentialProviderType": "GATEWAY_IAM_ROLE"}],
        clientToken=str(uuid.uuid4()))

# 80/20 split across two runtimes (per-variant eval configs, different log groups)
ab = agentcore.create_ab_test(
    name=f"HRTargetAB{SUFFIX}",
    gatewayArn=gw["gatewayArn"], roleArn=ROLE_ARN, enableOnCreate=True,
    evaluationConfig={"perVariantOnlineEvaluationConfig": [
        {"name": "C", "onlineEvaluationConfigArn": ONLINE_EVAL_V1_ARN},
        {"name": "T1", "onlineEvaluationConfigArn": ONLINE_EVAL_V2_ARN}]},
    gatewayFilter={"targetPaths": ["/HRAgentV1/*"]},
    variants=[
        {"name": "C",  "weight": 80, "variantConfiguration": {"target": {"name": "HRAgentV1"}}},
        {"name": "T1", "weight": 20, "variantConfiguration": {"target": {"name": "HRAgentV2"}}},
    ],
    clientToken=str(uuid.uuid4()),
)

# Promote the winner: stop the test and cut the winning target to 100%.
# (Or ramp gradually as an optional phased rollout: 20 → 50 → 100.)
agentcore.update_ab_test(abTestId=ab["abTestId"], variants=[
    {"name": "C",  "weight": 0,   "variantConfiguration": {"target": {"name": "HRAgentV1"}}},
    {"name": "T1", "weight": 100, "variantConfiguration": {"target": {"name": "HRAgentV2"}}},
])`,

  cleanup: `# Tear down everything created by the notebook (each block is independent)
agentcore.update_ab_test(abTestId=ab_id, executionStatus="STOPPED")
agentcore.delete_ab_test(abTestId=ab_id)
agentcore_control.update_online_evaluation_config(
    onlineEvaluationConfigId=oe_id, executionStatus="DISABLED")
agentcore_control.delete_online_evaluation_config(onlineEvaluationConfigId=oe_id)
agentcore_control.delete_configuration_bundle(bundleId=b_id)
logs.delete_delivery(id=DELIVERY_ID)
agentcore_control.delete_gateway_target(gatewayIdentifier=GATEWAY_ID, targetId=tid)
agentcore_control.delete_gateway(gatewayIdentifier=GATEWAY_ID)
agentcore_control.delete_agent_runtime(agentRuntimeId=AGENT_ID)
iam.delete_role(RoleName=ROLE_NAME)`,
};
