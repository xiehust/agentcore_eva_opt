/**
 * Shared simulation types. These model the shapes the AgentCore APIs return,
 * trimmed to what the UI needs. No `any` in any exported type.
 */

/** A single tool's name + description. */
export interface ToolDesc {
  name: string;
  description: string;
}

/** Baseline / evaluation score for one built-in evaluator. */
export interface EvaluatorScore {
  evaluatorId: string;
  /** Friendly label, e.g. "Goal Success Rate". */
  label: string;
  /** 0..1. */
  score: number;
}

/** One variant's result within an A/B metric. */
export interface ABVariantResult {
  name: string;
  /** 0..1 mean of the evaluator score for this variant. */
  mean: number;
  sampleSize: number;
  pValue: number;
  /** Signed percent change vs control. */
  percentChange: number;
  isSignificant: boolean;
}

/** One evaluator's A/B comparison: control stats + variant results. */
export interface ABMetric {
  evaluatorId: string;
  label: string;
  control: {
    name: string;
    mean: number;
    sampleSize: number;
  };
  variants: ABVariantResult[];
}

/** A versioned configuration bundle. */
export interface Bundle {
  bundleId: string;
  versionId: string;
  bundleName: string;
  systemPrompt: string;
  toolDescriptions: Record<string, string>;
  commitMessage: string;
  /** Lineage: the version this one was created from (promotion). */
  parentVersionId?: string;
}

/** Status of a single stage in a multi-stage simulated operation. */
export type StageStatus = "pending" | "running" | "done";

/** A stage definition for the simulation engine. */
export interface SimStage {
  /** Stable key. */
  key: string;
  /** Human label shown in the UI. */
  label: string;
  /** Simulated duration in ms (before speed multiplier). */
  ms: number;
  /** Optional terminal status text, e.g. "ACTIVE", "READY", "COMPLETED". */
  terminal?: string;
}

/** Progress event emitted as the engine advances through stages. */
export interface SimProgress {
  /** Index of the stage that just changed (0-based). */
  index: number;
  total: number;
  stage: SimStage;
  status: StageStatus;
}

/** A streamed session-log entry (baseline / gateway traffic). */
export interface SessionLogEntry {
  sessionId: string;
  employeeId: string;
  prompt: string;
}

/** A resource teardown item for the cleanup step. */
export interface CleanupItem {
  key: string;
  label: string;
  detail: string;
}
