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
  createdAt: number;
  updatedAt: number;
}

export interface DatasetItem {
  prompt: string;
  context?: string;
}

export interface DatasetRecord {
  id: string;
  name: string;
  description: string;
  items: DatasetItem[];
  createdAt: number;
  updatedAt: number;
}

export type RunStatus =
  | "pending"
  | "invoking"
  | "waiting"
  | "evaluating"
  | "completed"
  | "failed";

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
}

// ─── Experiments (optimization flow) ───────────────────────────────────────
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
    code: string;
    requirements?: string[];
    config?: AgentConfig | null;
  }) {
    return this.request<AgentRecord>("POST", "/agents", body);
  }
  getAgent(id: string) {
    return this.request<AgentRecord>("GET", `/agents/${id}`);
  }
  updateAgent(
    id: string,
    body: Partial<Pick<AgentRecord, "name" | "description" | "code" | "requirements" | "config">>,
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

  // ─── Console: datasets ────────────────────────────────────────────────
  listDatasets() {
    return this.request<{ datasets: DatasetRecord[] }>("GET", "/datasets");
  }
  createDataset(body: { name: string; description?: string; items: DatasetItem[] }) {
    return this.request<DatasetRecord>("POST", "/datasets", body);
  }
  getDataset(id: string) {
    return this.request<DatasetRecord>("GET", `/datasets/${id}`);
  }
  updateDataset(
    id: string,
    body: Partial<Pick<DatasetRecord, "name" | "description" | "items">>,
  ) {
    return this.request<DatasetRecord>("PUT", `/datasets/${id}`, body);
  }
  deleteDataset(id: string) {
    return this.request<{ ok: boolean }>("DELETE", `/datasets/${id}`);
  }

  // ─── Console: runs ────────────────────────────────────────────────────
  createRun(body: {
    agentId: string;
    datasetId: string;
    evaluators?: string[];
    waitSeconds?: number;
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
  sampleAgent(variant: "v1" | "v2" = "v1") {
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
  createExperiment(body: { name: string; agentId: string }) {
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
