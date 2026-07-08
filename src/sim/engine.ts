import type { SimStage, SimProgress, CleanupItem } from "./types";

/** Fake AWS account used everywhere — never a real account id. */
export const FAKE_ACCOUNT_ID = "123456789012";
export const DEFAULT_REGION = "us-west-2";

/**
 * Deterministic 6-char lowercase hex suffix. With a seed, always returns the
 * same value (used in tests + reproducible journeys); without, derives one
 * from a non-time source per call site via the optional seed.
 */
export function makeSuffix(seed?: number): string {
  // Mulberry32 — tiny deterministic PRNG. Seeded => stable output.
  let s =
    seed ??
    // Non-deterministic fallback: combine a counter with crypto when available.
    (typeof crypto !== "undefined" && "getRandomValues" in crypto
      ? crypto.getRandomValues(new Uint32Array(1))[0]
      : Math.floor(performance.now() * 1000));
  let hex = "";
  for (let i = 0; i < 6; i++) {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    const v = ((t ^ (t >>> 14)) >>> 0) % 16;
    hex += v.toString(16);
  }
  return hex;
}

/** Build a fabricated ARN. Always uses the fake account id. */
export function fakeArn(
  service: string,
  resourceType: string,
  resourceId: string,
  opts: { region?: string; accountId?: string } = {},
): string {
  const region = opts.region ?? DEFAULT_REGION;
  // Account id is intentionally hard-pinned to the fake value.
  const account = FAKE_ACCOUNT_ID;
  void opts.accountId; // ignored on purpose — never emit a caller-supplied account
  return `arn:aws:${service}:${region}:${account}:${resourceType}/${resourceId}`;
}

/** A short fabricated resource id like "a1b2c3d4". */
export function fakeId(prefix: string, seed?: number): string {
  return `${prefix}${makeSuffix(seed)}`;
}

/** Sleep helper that resolves after `ms` (scaled by the engine's speed). */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}

export interface SimulateOptions {
  /** Multiplier applied to every stage's duration. <1 = faster. Default 1. */
  speed?: number;
  /** Called as each stage flips to running, then to done. */
  onProgress?: (p: SimProgress) => void;
  /** Abort signal — stops advancing if aborted. */
  signal?: AbortSignal;
}

/**
 * Advance through a list of stages, emitting progress as each begins and
 * completes. Resolves once all stages are done. Ordering is deterministic;
 * only wall-clock timing varies with `speed`.
 */
export async function simulateAsync(
  stages: SimStage[],
  opts: SimulateOptions = {},
): Promise<void> {
  const speed = opts.speed ?? 1;
  const total = stages.length;
  for (let i = 0; i < total; i++) {
    if (opts.signal?.aborted) return;
    const stage = stages[i];
    opts.onProgress?.({ index: i, total, stage, status: "running" });
    await delay(stage.ms * speed);
    if (opts.signal?.aborted) return;
    opts.onProgress?.({ index: i, total, stage, status: "done" });
  }
}

// ─── Canned stage sequences (mirror the notebook's long-running ops) ───────

/** Deploy sequence: IAM role → package → upload → create runtime → ACTIVE. */
export function deployStages(label = "v1"): SimStage[] {
  return [
    { key: "role", label: "Creating IAM execution role", ms: 420 },
    { key: "package", label: `Packaging ${label} agent (ARM64 deps)`, ms: 620 },
    { key: "upload", label: "Uploading artifact to S3", ms: 380 },
    { key: "runtime", label: "Creating AgentCore Runtime", ms: 520 },
    { key: "poll", label: "Polling runtime status", ms: 480, terminal: "ACTIVE" },
  ];
}

/** Generic create-and-poll sequence to a terminal status. */
export function pollStages(
  what: string,
  terminal = "READY",
  createMs = 360,
  pollMs = 420,
): SimStage[] {
  return [
    { key: "create", label: `Creating ${what}`, ms: createMs },
    { key: "poll", label: `Polling ${what} status`, ms: pollMs, terminal },
  ];
}

/** Batch-evaluation / recommendation polling sequence. */
export function evalStages(what: string, terminal = "COMPLETED"): SimStage[] {
  return [
    { key: "start", label: `Starting ${what}`, ms: 300 },
    { key: "discover", label: "Discovering sessions from CloudWatch", ms: 520 },
    { key: "score", label: "Running LLM evaluators", ms: 700 },
    { key: "aggregate", label: "Aggregating scores", ms: 460, terminal },
  ];
}

/** Dataset-runner sequence: invoke → wait → submit → poll (batch runner). */
export function datasetEvalStages(terminal = "COMPLETED"): SimStage[] {
  return [
    { key: "invoke", label: "Invoking agent per scenario (3 sessions)", ms: 620 },
    { key: "wait", label: "Waiting for CloudWatch ingestion", ms: 520 },
    { key: "submit", label: "Submitting StartBatchEvaluation with ground truth", ms: 380 },
    { key: "poll", label: "Polling GetBatchEvaluation", ms: 560, terminal },
  ];
}

/** User-simulation sequence: the actor drives multi-turn conversations. */
export function userSimStages(terminal = "COMPLETED"): SimStage[] {
  return [
    { key: "spawn", label: "Spawning LLM actors (2 personas)", ms: 340 },
    { key: "converse", label: "Actors conversing with the agent", ms: 900 },
    { key: "stop", label: "Goal / max_turns stop conditions reached", ms: 300 },
    { key: "evaluate", label: "Evaluating completed sessions", ms: 520, terminal },
  ];
}

/** Insights analysis sequence: per-session LLM triage, then clustering. */
export function insightStages(terminal = "COMPLETED"): SimStage[] {
  return [
    { key: "start", label: "Starting insights analysis", ms: 300 },
    { key: "discover", label: "Discovering sessions from CloudWatch", ms: 480 },
    { key: "analyze", label: "Analyzing each session (LLM triage)", ms: 760 },
    { key: "cluster", label: "Clustering findings across sessions", ms: 620, terminal },
  ];
}

/** The resource categories torn down during cleanup (Step 9). */
export const CLEANUP_ITEMS: CleanupItem[] = [
  { key: "abtests", label: "A/B tests", detail: "bundle + target routing tests" },
  { key: "onlineeval", label: "Online evaluation configs", detail: "v1 + v2 auto-scoring" },
  { key: "bundles", label: "Configuration bundles", detail: "baseline, control, treatment" },
  { key: "tracing", label: "Gateway tracing", detail: "X-Ray delivery + source" },
  { key: "targets", label: "Gateway targets", detail: "HRAgentV1, HRAgentV2" },
  { key: "gateway", label: "Gateway", detail: "HTTP gateway + IAM authorizer" },
  { key: "runtimes", label: "Agent runtimes", detail: "v1 + v2 AgentCore runtimes" },
  { key: "iam", label: "IAM execution role", detail: "permissions + trust policy" },
  { key: "s3", label: "S3 artifacts", detail: "deployment bucket objects" },
];
