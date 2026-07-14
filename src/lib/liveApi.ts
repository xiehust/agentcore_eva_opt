/**
 * Typed client for the Live-AWS backend. All methods POST/GET JSON against the
 * configured base URL (default "/api", proxied to the FastAPI server in dev).
 * Long operations return a { jobId }; use pollJob to await the real result.
 */
import type { LiveCreds } from "../state/journey";

export interface JobRef {
  jobId: string;
}

export type JobState = "pending" | "running" | "completed" | "failed";

export interface JobStatus<T = unknown> {
  id: string;
  state: JobState;
  result?: T;
  error?: string;
  progress?: string;
}

export class LiveApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "LiveApiError";
    this.status = status;
  }
}

// ─── Console resource types (mirror backend/app/db.py row shapes) ─────────
export interface AgentDeployment {
  status: "deploying" | "deployed" | "failed";
  runtimeArn?: string;
  runtimeId?: string;
  logGroup?: string;
  serviceName?: string;
  roleArn?: string;
  roleName?: string;
  region?: string;
  deployedAt?: number;
  error?: string;
}

export interface AgentConfig {
  systemPrompt: string;
  toolDescriptions: Record<string, string>;
}

export type AgentKind = "managed" | "external";

/** How dataset traffic reaches an external agent over HTTP. */
export interface InvokeConfig {
  url: string;
  method?: "POST";
  payloadTemplate?: string;
  sessionHeader?: string;
  headers?: Record<string, string>;
  timeoutSeconds?: number;
}

/** Telemetry binding for an external agent: where its OTEL traces land. */
export interface AgentBinding {
  serviceName: string;
  logGroup: string;
  region?: string | null;
  invoke?: InvokeConfig | null;
}

/** Result of POST /agents/{id}/telemetry-check (via job polling). */
export interface TelemetryCheckResult {
  ok: boolean;
  serviceName: string;
  logGroup: { name: string; exists: boolean };
  spans: {
    spanCount: number;
    lastSpanAt: number | null;
    sessionIdPresent: boolean;
    sessionIdSamples: string[];
    operationNames: string[];
  };
  /** English technical hints, rendered verbatim (like terminal statuses). */
  hints: string[];
}

export interface AgentRecord {
  id: string;
  name: string;
  description: string;
  /** Present on GET /agents/{id}; omitted from list responses. */
  code?: string;
  requirements: string[];
  deployment: AgentDeployment | null;
  /** Runtime-overridable config, read by recommendations + bundles. */
  config: AgentConfig | null;
  /** 'managed' (deployed to AgentCore runtime) or 'external' (registered by binding). */
  kind: AgentKind;
  binding: AgentBinding | null;
  createdAt: number;
  updatedAt: number;
}

export interface DatasetItem {
  prompt: string;
  context?: string;
}

/** legacy = prompt list; predefined/simulated = devguide scenario schema. */
export type DatasetKind = "legacy" | "predefined" | "simulated";

export interface ScenarioTurn {
  input: string;
  expected_response?: string;
}

export interface ActorProfile {
  context: string;
  goal: string;
  traits?: Record<string, string>;
}

/** Devguide dataset-schema scenario (predefined or simulated shape). */
export interface Scenario {
  scenario_id: string;
  scenario_description?: string;
  turns?: ScenarioTurn[];
  expected_trajectory?: string[];
  actor_profile?: ActorProfile;
  input?: string;
  max_turns?: number;
  assertions?: string[];
  metadata?: Record<string, unknown>;
}

/** AWS Dataset resource info recorded after a sync-to-AWS. */
export interface CloudDatasetInfo {
  datasetId: string;
  datasetArn?: string | null;
  datasetName?: string;
  status: string;
  exampleCount?: number | null;
  syncedAt?: number;
}

export interface CloudDatasetRow {
  datasetId: string;
  datasetArn?: string | null;
  name: string;
  description?: string | null;
  status: string;
  schemaType?: string | null;
  exampleCount?: number | null;
  createdAt?: string | null;
  downloadUrl?: string | null;
}

export interface DatasetRecord {
  id: string;
  name: string;
  description: string;
  /** Legacy prompt items OR devguide scenarios, depending on `kind`. */
  items: (DatasetItem | Scenario)[];
  kind: DatasetKind;
  cloud: CloudDatasetInfo | null;
  createdAt: number;
  updatedAt: number;
}

/** The prompt items of a legacy dataset ([] for scenario kinds). */
export function legacyItems(dataset: Pick<DatasetRecord, "items" | "kind">): DatasetItem[] {
  if (dataset.kind !== "legacy") return [];
  return dataset.items as DatasetItem[];
}

export type RunStatus =
  | "pending"
  | "invoking"
  | "waiting"
  | "evaluating"
  | "completed"
  | "failed";

export interface TranscriptEntry {
  turn: number;
  role: "user" | "agent" | "actor_reasoning";
  text: string;
}

/** One simulated scenario's conversation, recorded by the actor loop. */
export interface ScenarioTranscript {
  scenario_id: string;
  turns: number;
  stopped_by: "goal" | "max_turns" | "no_message" | "parse_error";
  transcript: TranscriptEntry[];
}

export interface RunRecord {
  id: string;
  agentId: string;
  datasetId: string;
  agentName: string;
  datasetName: string;
  agentArn: string | null;
  evaluators: string[];
  sessionIds: string[] | null;
  batchEvaluationId: string | null;
  scores: { evaluatorId: string; score: number }[] | null;
  status: RunStatus;
  error: string | null;
  jobId: string | null;
  /** "dataset" | "lookback:<hours>" | "sessions:<count>" */
  source: string;
  /** Simulated-run conversations (per scenario); null otherwise. */
  transcripts: ScenarioTranscript[] | null;
  createdAt: number;
  updatedAt: number;
}

// ─── Insight reports (failure analysis / user intent / execution summary) ──
export type InsightReportStatus = "pending" | "analyzing" | "completed" | "failed";

export interface FailureRootCause {
  name: string;
  description?: string;
  recommendation?: string;
  affectedSessionCount: number;
  affectedSessions?: { sessionId: string }[];
}

export interface FailureSubCategory {
  clusterId?: number;
  name: string;
  description?: string;
  affectedSessionCount: number;
  rootCauses?: FailureRootCause[];
}

export interface FailureCategory {
  clusterId?: number;
  name: string;
  description?: string;
  affectedSessionCount: number;
  subCategories?: FailureSubCategory[];
}

export interface UserIntentCluster {
  clusterId?: number;
  name: string;
  description?: string;
  affectedSessionCount: number;
  affectedSessions?: { sessionId: string; userMessages?: string[] }[];
}

export interface ExecutionSummaryCluster {
  clusterId?: number;
  name: string;
  description?: string;
  affectedSessionCount: number;
  affectedSessions?: {
    sessionId: string;
    approachTaken?: string;
    finalOutcome?: string;
  }[];
}

export interface InsightResults {
  failures?: FailureCategory[];
  userIntents?: UserIntentCluster[];
  executionSummaries?: ExecutionSummaryCluster[];
}

export interface InsightReportRecord {
  id: string;
  agentId: string | null;
  agentName: string;
  /** "run:<runId>" (session-scoped) or "agent" (time-range scoped). */
  source: string;
  insights: string[];
  sessionIds: string[] | null;
  timeRange: { startTime: string; endTime: string } | null;
  batchEvaluationId: string | null;
  results: InsightResults | null;
  status: InsightReportStatus;
  error: string | null;
  jobId: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface SampleAgent {
  name: string;
  description: string;
  code: string;
  requirements: string[];
  config: AgentConfig;
}

export interface SampleDataset {
  name: string;
  description: string;
  items: DatasetItem[];
}

export interface SampleDatasetEntry extends SampleDataset {
  key: string;
  /** Present on scenario samples; absent means a legacy prompt list. */
  kind?: DatasetKind;
}

// ─── Experiments (optimization flow) ───────────────────────────────────────
/** Which A/B pattern an experiment runs — two independent, self-contained flows:
 *   config_bundle → ONE runtime, variantConfiguration.configurationBundle, 50/50.
 *   target_based  → TWO endpoints, variantConfiguration.target + per-variant
 *                   online-eval + gatewayFilter, 80/20 with an optional rollout. */
export type ExperimentKind = "config_bundle" | "target_based";

export type ExperimentStage =
  | "recommend"
  | "bundles"
  | "abtest"
  | "monitor"
  | "promoted"
  | "canary"
  | "canary_monitor"
  | "done";

export const EXPERIMENT_STAGES: ExperimentStage[] = [
  "recommend",
  "bundles",
  "abtest",
  "monitor",
  "promoted",
  "canary",
  "canary_monitor",
  "done",
];

/** Per-kind stage sequences so progress/labels match each flow. Config-bundle
 * runs recommend→bundles→A/B→monitor→promote; target-based skips recommend/
 * bundles and runs its own gateway setup→A/B→monitor→roll-out-winner. */
export const CONFIG_BUNDLE_STAGES: ExperimentStage[] = [
  "recommend",
  "bundles",
  "abtest",
  "monitor",
  "promoted",
  "done",
];

export const TARGET_BASED_STAGES: ExperimentStage[] = [
  "recommend",
  "abtest",
  "monitor",
  "done",
];

export function stagesForKind(kind: ExperimentKind): ExperimentStage[] {
  return kind === "target_based" ? TARGET_BASED_STAGES : CONFIG_BUNDLE_STAGES;
}

// Matches agentcore.normalize_ab_results and the sim's ABMetric shape
// (src/sim/types.ts), so metrics flow straight into ABComparisonChart.
export interface ABTestMetric {
  evaluatorId: string;
  label: string;
  control: { name: string; mean: number; sampleSize: number };
  variants: {
    name: string;
    mean: number;
    sampleSize: number;
    pValue: number;
    percentChange: number;
    isSignificant: boolean;
  }[];
}

/** Open bag of ids/results accumulated across experiment stages. Job ids are
 * persisted BEFORE polling so a reload can resume an in-flight stage. */
export interface ExperimentArtifacts {
  recommendSpJobId?: string;
  recommendTdJobId?: string;
  recommendedSystemPrompt?: string;
  recommendedToolDescriptions?: Record<string, string>;
  usedFallbackSp?: boolean;
  usedFallbackTd?: boolean;
  acceptedSystemPrompt?: string;
  acceptedToolDescriptions?: Record<string, string>;
  controlBundleId?: string;
  controlBundleVersion?: string;
  treatmentBundleId?: string;
  treatmentBundleVersion?: string;
  gatewaySetupJobId?: string;
  gatewayId?: string;
  gatewayArn?: string;
  roleArn?: string;
  targetNameV1?: string;
  targetIdV1?: string;
  onlineEvalArnV1?: string;
  onlineEvalIdV1?: string;
  bundleAbTestId?: string;
  gwTrafficJobId?: string;
  gwTrafficDatasetId?: string;
  gwTrafficCount?: number;
  bundleMetrics?: ABTestMetric[];
  bundleAnalysisAt?: string;
  promotedVersionId?: string;
  targetSetupJobId?: string;
  targetNameV2?: string;
  targetIdV2?: string;
  onlineEvalArnV2?: string;
  onlineEvalIdV2?: string;
  targetAbTestId?: string;
  targetTrafficJobId?: string;
  targetTrafficDatasetId?: string;
  targetTrafficCount?: number;
  targetMetrics?: ABTestMetric[];
  targetAnalysisAt?: string;
  weights?: { control: number; treatment: number };
  cleanupResults?: { category: string; status: string; detail: string }[];
  cleanedAt?: number;
}

export interface ExperimentRecord {
  id: string;
  name: string;
  agentId: string;
  agentName: string;
  challengerAgentId: string | null;
  challengerAgentName: string | null;
  kind: ExperimentKind;
  stage: ExperimentStage;
  artifacts: ExperimentArtifacts;
  error: string | null;
  createdAt: number;
  updatedAt: number;
}

export class LiveApi {
  constructor(private base: string = "/api") {}

  private url(path: string): string {
    // Join base + path without doubling slashes.
    const b = this.base.replace(/\/$/, "");
    const p = path.startsWith("/") ? path : `/${path}`;
    return `${b}${p}`;
  }

  private async request<T>(
    method: "GET" | "POST" | "PUT" | "DELETE",
    path: string,
    body?: unknown,
  ): Promise<T> {
    const resp = await fetch(this.url(path), {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!resp.ok) {
      let detail = `${resp.status} ${resp.statusText}`;
      try {
        const j = await resp.json();
        if (j?.detail) detail = typeof j.detail === "string" ? j.detail : detail;
      } catch {
        /* body not JSON */
      }
      throw new LiveApiError(detail, resp.status);
    }
    return (await resp.json()) as T;
  }

  // ─── Health / identity ────────────────────────────────────────────────
  health() {
    return this.request<{ status: string }>("GET", "/health");
  }

  identity(creds?: LiveCreds) {
    return this.request<{
      ok: boolean;
      account?: string;
      arn?: string;
      region?: string;
      error?: string;
    }>("POST", "/identity", { creds: creds ?? null });
  }

  // ─── Long ops (return jobId) ──────────────────────────────────────────
  deploy(body: Record<string, unknown>) {
    return this.request<JobRef>("POST", "/deploy", body);
  }
  traffic(body: Record<string, unknown>) {
    return this.request<JobRef>("POST", "/traffic", body);
  }
  evaluate(body: Record<string, unknown>) {
    return this.request<JobRef>("POST", "/evaluate", body);
  }
  recommendSystemPrompt(body: Record<string, unknown>) {
    return this.request<JobRef>("POST", "/recommend/system-prompt", body);
  }

  // ─── Custom evaluators (synchronous) ──────────────────────────────────
  createEvaluator(body: Record<string, unknown>) {
    return this.request<{
      evaluatorId: string;
      evaluatorArn?: string;
      status?: string;
    }>("POST", "/evaluators", body);
  }
  deleteEvaluator(id: string) {
    return this.request<{ evaluatorId: string; deleted: boolean }>(
      "DELETE",
      `/evaluators/${id}`,
    );
  }
  recommendToolDescriptions(body: Record<string, unknown>) {
    return this.request<JobRef>("POST", "/recommend/tool-descriptions", body);
  }

  // ─── Bundles (synchronous) ────────────────────────────────────────────
  createBundle(body: Record<string, unknown>) {
    return this.request<{ bundleId: string; versionId: string; bundleArn?: string }>(
      "POST",
      "/bundles",
      body,
    );
  }
  getBundle(id: string) {
    return this.request<Record<string, unknown>>("GET", `/bundles/${id}`);
  }
  updateBundle(id: string, body: Record<string, unknown>) {
    return this.request<{ bundleId: string; versionId: string }>(
      "POST",
      `/bundles/${id}/version`,
      body,
    );
  }
  compareBundles(body: Record<string, unknown>) {
    return this.request<Record<string, unknown>>("POST", "/bundles/compare", body);
  }

  // ─── Gateway setup (returns jobId) ────────────────────────────────────
  gatewaySetup(body: Record<string, unknown>) {
    return this.request<JobRef>("POST", "/gateway/setup", body);
  }
  gatewayTraffic(body: Record<string, unknown>) {
    return this.request<JobRef>("POST", "/gateway/traffic", body);
  }

  // ─── A/B tests ────────────────────────────────────────────────────────
  abtestConfigBundle(body: Record<string, unknown>) {
    return this.request<{ abTestId: string }>("POST", "/abtest/config-bundle", body);
  }
  abtestTarget(body: Record<string, unknown>) {
    return this.request<{ abTestId: string }>("POST", "/abtest/target", body);
  }
  abtestTargetSetup(body: Record<string, unknown>) {
    return this.request<JobRef>("POST", "/abtest/target-setup", body);
  }
  getAbTest(id: string) {
    return this.request<Record<string, unknown>>("GET", `/abtest/${id}`);
  }
  setWeights(id: string, body: Record<string, unknown>) {
    return this.request<Record<string, unknown>>("POST", `/abtest/${id}/weights`, body);
  }

  // ─── Cleanup ──────────────────────────────────────────────────────────
  cleanup(body: Record<string, unknown>) {
    return this.request<{
      results: { category: string; status: string; detail: string }[];
      deleted: number;
      total: number;
    }>("POST", "/cleanup", body);
  }

  // ─── Session persistence (survives backend restart + page reload) ──────
  saveSession(sessionId: string, data: object) {
    return this.request<{ ok: boolean }>("PUT", "/session", { sessionId, data });
  }
  loadSession(sessionId: string) {
    return this.request<{ sessionId: string; data: Record<string, unknown> }>(
      "GET",
      `/session/${sessionId}`,
    );
  }
  deleteSession(sessionId: string) {
    return this.request<{ ok: boolean }>("DELETE", `/session/${sessionId}`);
  }

  // ─── Console: agents ──────────────────────────────────────────────────
  listAgents() {
    return this.request<{ agents: AgentRecord[] }>("GET", "/agents");
  }
  createAgent(body: {
    name: string;
    description?: string;
    code?: string;
    requirements?: string[];
    config?: AgentConfig | null;
    kind?: AgentKind;
    binding?: AgentBinding | null;
  }) {
    return this.request<AgentRecord>("POST", "/agents", body);
  }
  getAgent(id: string) {
    return this.request<AgentRecord>("GET", `/agents/${id}`);
  }
  updateAgent(
    id: string,
    body: Partial<
      Pick<AgentRecord, "name" | "description" | "code" | "requirements" | "config" | "binding">
    >,
  ) {
    return this.request<AgentRecord>("PUT", `/agents/${id}`, body);
  }
  deleteAgent(id: string) {
    return this.request<{ ok: boolean }>("DELETE", `/agents/${id}`);
  }
  deployAgent(id: string, body: Record<string, unknown> = {}) {
    return this.request<JobRef>("POST", `/agents/${id}/deploy`, body);
  }
  undeployAgent(id: string, body: Record<string, unknown> = {}) {
    return this.request<JobRef>("POST", `/agents/${id}/undeploy`, body);
  }
  telemetryCheck(id: string, body: { lookbackHours?: number; creds?: LiveCreds | null } = {}) {
    return this.request<JobRef>("POST", `/agents/${id}/telemetry-check`, body);
  }

  // ─── Console: datasets ────────────────────────────────────────────────
  listDatasets() {
    return this.request<{ datasets: DatasetRecord[] }>("GET", "/datasets");
  }
  createDataset(body: {
    name: string;
    description?: string;
    kind?: DatasetKind;
    items?: DatasetItem[];
    scenarios?: Scenario[];
  }) {
    return this.request<DatasetRecord>("POST", "/datasets", body);
  }
  getDataset(id: string) {
    return this.request<DatasetRecord>("GET", `/datasets/${id}`);
  }
  updateDataset(
    id: string,
    body: {
      name?: string;
      description?: string;
      items?: DatasetItem[];
      scenarios?: Scenario[];
    },
  ) {
    return this.request<DatasetRecord>("PUT", `/datasets/${id}`, body);
  }
  deleteDataset(id: string) {
    return this.request<{ ok: boolean }>("DELETE", `/datasets/${id}`);
  }
  /** Create the AWS Dataset resource from a local dataset (background job). */
  syncDatasetToAws(id: string, body: { creds?: LiveCreds | null } = {}) {
    return this.request<JobRef>("POST", `/datasets/${id}/sync-to-aws`, body);
  }
  listCloudDatasets(body: { creds?: LiveCreds | null } = {}) {
    return this.request<{ datasets: CloudDatasetRow[] }>("POST", "/datasets/cloud/list", body);
  }
  getCloudDataset(cloudId: string, body: { creds?: LiveCreds | null } = {}) {
    return this.request<CloudDatasetRow>("POST", `/datasets/cloud/${cloudId}/get`, body);
  }
  deleteCloudDataset(cloudId: string) {
    return this.request<{ datasetId: string; deleted: boolean }>(
      "DELETE",
      `/datasets/cloud/${cloudId}`,
    );
  }

  // ─── Console: runs ────────────────────────────────────────────────────
  /** Exactly one of datasetId (active) / lookbackHours / sessionIds (passive). */
  createRun(body: {
    agentId: string;
    datasetId?: string;
    lookbackHours?: number;
    sessionIds?: string[];
    evaluators?: string[];
    waitSeconds?: number;
    /** Actor model for user-simulation datasets (Bedrock model id). */
    simulationModelId?: string;
    creds?: LiveCreds | null;
  }) {
    return this.request<{ runId: string; jobId: string }>("POST", "/runs", body);
  }
  listRuns() {
    return this.request<{ runs: RunRecord[] }>("GET", "/runs");
  }
  getRun(id: string) {
    return this.request<RunRecord>("GET", `/runs/${id}`);
  }
  deleteRun(id: string) {
    return this.request<{ ok: boolean }>("DELETE", `/runs/${id}`);
  }

  // ─── Console: samples + evaluator list ────────────────────────────────
  sampleAgent(variant: "v1" | "v2" | "zh" = "v1") {
    return this.request<SampleAgent>("GET", `/samples/agent?variant=${variant}`);
  }
  sampleDataset() {
    return this.request<SampleDataset>("GET", "/samples/dataset");
  }
  sampleDatasets() {
    return this.request<{ datasets: SampleDatasetEntry[] }>("GET", "/samples/datasets");
  }

  // ─── Console: experiments ─────────────────────────────────────────────
  listExperiments() {
    return this.request<{ experiments: ExperimentRecord[] }>("GET", "/experiments");
  }
  createExperiment(body: { name: string; agentId: string; kind?: ExperimentKind }) {
    return this.request<ExperimentRecord>("POST", "/experiments", body);
  }
  getExperiment(id: string) {
    return this.request<ExperimentRecord>("GET", `/experiments/${id}`);
  }
  updateExperiment(
    id: string,
    body: {
      name?: string;
      stage?: ExperimentStage;
      challengerAgentId?: string;
      artifacts?: ExperimentArtifacts;
      error?: string;
    },
  ) {
    return this.request<ExperimentRecord>("PUT", `/experiments/${id}`, body);
  }
  deleteExperiment(id: string) {
    return this.request<{ ok: boolean }>("DELETE", `/experiments/${id}`);
  }
  // ─── Console: insight reports ─────────────────────────────────────────
  listInsightReports() {
    return this.request<{ reports: InsightReportRecord[] }>("GET", "/insights");
  }
  createInsightReport(body: {
    agentId: string;
    insights?: string[];
    runId?: string;
    lookbackHours?: number;
    creds?: LiveCreds | null;
  }) {
    return this.request<{ reportId: string; jobId: string }>("POST", "/insights", body);
  }
  getInsightReport(id: string) {
    return this.request<InsightReportRecord>("GET", `/insights/${id}`);
  }
  deleteInsightReport(id: string) {
    return this.request<{ ok: boolean }>("DELETE", `/insights/${id}`);
  }

  listEvaluators(creds?: LiveCreds | null) {
    return this.request<{
      evaluators: {
        evaluatorId: string;
        name: string;
        type?: string;
        level?: string;
        status?: string;
      }[];
    }>("POST", "/evaluators/list", { creds: creds ?? null });
  }

  // ─── Job polling ──────────────────────────────────────────────────────
  getJob<T = unknown>(jobId: string) {
    return this.request<JobStatus<T>>("GET", `/jobs/${jobId}`);
  }

  /** Poll a job until it reaches a terminal state; reject on failure/timeout. */
  async pollJob<T = unknown>(
    jobId: string,
    opts: {
      intervalMs?: number;
      timeoutMs?: number;
      onProgress?: (s: JobStatus<T>) => void;
      sleep?: (ms: number) => Promise<void>;
    } = {},
  ): Promise<T> {
    const interval = opts.intervalMs ?? 2000;
    const timeout = opts.timeoutMs ?? 20 * 60 * 1000; // 20 min for slow AWS ops
    const sleep =
      opts.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
    const start = Date.now();
    // Loop guarded by the timeout, not wall-clock functions the runtime blocks.
    for (;;) {
      const job = await this.getJob<T>(jobId);
      opts.onProgress?.(job);
      if (job.state === "completed") return job.result as T;
      if (job.state === "failed") {
        throw new LiveApiError(job.error ?? "job failed", 0);
      }
      if (Date.now() - start > timeout) {
        throw new LiveApiError("job polling timed out", 0);
      }
      await sleep(interval);
    }
  }
}

export function makeLiveApi(base = "/api"): LiveApi {
  return new LiveApi(base);
}
