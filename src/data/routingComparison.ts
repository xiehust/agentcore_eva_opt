/**
 * Config-bundle vs target-based routing comparison — from the Lab 4 notebook
 * (Step 8 markdown). Rendered as a table in Step 8.
 */
export interface RoutingRow {
  dimension: string;
  configBundle: string;
  targetBased: string;
}

export const ROUTING_COMPARISON: RoutingRow[] = [
  {
    dimension: "What changes",
    configBundle: "System prompt or config (no code change)",
    targetBased: "Agent code, tools, or model",
  },
  {
    dimension: "Deployment",
    configBundle: "No redeployment needed",
    targetBased: "Requires deploying a new runtime",
  },
  {
    dimension: "Runtimes needed",
    configBundle: "One shared runtime",
    targetBased: "Two separate runtimes",
  },
  {
    dimension: "Eval configs needed",
    configBundle: "One shared online eval config",
    targetBased: "One per variant (different log groups)",
  },
  {
    dimension: "Use case",
    configBundle: "Prompt optimization, config tuning",
    targetBased: "Code rollout, version upgrade",
  },
  {
    dimension: "Risk",
    configBundle: "Very low — instant rollback via bundle",
    targetBased: "Higher — binary change",
  },
];

/** Summary table rows (notebook Step → action → key API) for the closing card. */
export interface SummaryRow {
  step: string;
  action: string;
  api: string;
}

export const JOURNEY_SUMMARY: SummaryRow[] = [
  { step: "2", action: "Deployed HR Assistant to AgentCore Runtime", api: "create_agent_runtime" },
  { step: "3", action: "Created baseline Configuration Bundle and sent traffic", api: "create_configuration_bundle · invoke_agent_runtime" },
  { step: "4", action: "Measured baseline performance", api: "start_batch_evaluation · get_batch_evaluation" },
  { step: "5a", action: "Generated improved system prompt from traces", api: "start_recommendation (SYSTEM_PROMPT)" },
  { step: "5b", action: "Generated improved tool descriptions", api: "start_recommendation (TOOL_DESCRIPTION)" },
  { step: "6", action: "Packaged control and treatment configs", api: "create_configuration_bundle" },
  { step: "7", action: "A/B tested config change via config-bundle routing", api: "create_ab_test (configurationBundle)" },
  { step: "8", action: "Canary rollout of v2 via target-based routing", api: "create_ab_test (target, 90/10)" },
];

/** Key takeaways (notebook conclusions). */
export const TAKEAWAYS: { title: string; body: string }[] = [
  {
    title: "Observability",
    body: "Collect detailed traces and metrics to drill into the reasoning and tool-calling behind every response.",
  },
  {
    title: "Evaluation",
    body: "Automatically score traces — from goal completion down to helpfulness and correctness.",
  },
  {
    title: "Recommendations",
    body: "Let the platform propose improved system prompts and tool descriptions from observed performance.",
  },
  {
    title: "A/B testing",
    body: "Build confidence that each new deployment consistently improves results before full rollout.",
  },
];

export const EXTERNAL_LINKS: { label: string; href: string }[] = [
  {
    label: "Getting started with AgentCore (workshop)",
    href: "https://catalog.workshops.aws/agentcore-getting-started",
  },
  {
    label: "awslabs/agentcore-samples (GitHub)",
    href: "https://github.com/awslabs/agentcore-samples",
  },
];
