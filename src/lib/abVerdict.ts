import type { ABMetric } from "../sim/types";
import { en, type Messages } from "../i18n/messages";

export type VerdictStatus = "win" | "mixed" | "loss";

export interface PromoteVerdict {
  status: VerdictStatus;
  improvedCount: number;
  total: number;
  /** True only if at least one improved metric is statistically significant. */
  significant: boolean;
  /** Per-metric signed deltas, e.g. "GoalSuccessRate +2.1%, Helpfulness −7.9%". */
  summary: string;
}

/** Format a signed percent, using a real minus sign for readability. */
export function fmtPct(p: number): string {
  const r = Math.round(p * 10) / 10;
  return `${r >= 0 ? "+" : "−"}${Math.abs(r).toFixed(1)}%`;
}

/**
 * Interpret A/B metrics for the promote card. Higher mean is better for the
 * built-in evaluators, so `percentChange > 0` means the treatment (T1) improved.
 * Returns null when there are no metrics yet.
 */
export function promoteVerdict(metrics: ABMetric[]): PromoteVerdict | null {
  if (!metrics.length) return null;
  const total = metrics.length;
  const improved = metrics.filter((m) => (m.variants[0]?.percentChange ?? 0) > 0);
  const improvedCount = improved.length;
  const status: VerdictStatus =
    improvedCount === total ? "win" : improvedCount === 0 ? "loss" : "mixed";
  const significant = improved.some((m) => m.variants[0]?.isSignificant);
  const summary = metrics
    .map((m) => `${m.label} ${fmtPct(m.variants[0]?.percentChange ?? 0)}`)
    .join(", ");
  return { status, improvedCount, total, significant, summary };
}

/** The lead sentence for the promote card, phrased to match the real result.
 * Pass the active message catalog for localization (defaults to English). */
export function verdictSentence(v: PromoteVerdict, t: Messages = en): string {
  const sig = v.significant ? t.verdict.significant : t.verdict.notSignificant;
  if (v.status === "win") {
    const scope =
      v.total === 2 ? t.verdict.bothMetrics : t.verdict.allMetrics(v.total);
    return `${t.verdict.win(scope, v.summary)}${sig}`;
  }
  if (v.status === "loss") {
    const scope = v.total === 2 ? t.verdict.eitherMetric : t.verdict.anyMetric;
    return `${t.verdict.loss(scope, v.summary)}${sig}`;
  }
  return `${t.verdict.mixed(v.improvedCount, v.total, v.summary)}${sig}`;
}
