import type { ABMetric, EvaluatorScore } from "../sim/types";

/**
 * Pre-computed evaluation + A/B results (Steps 4, 7, 8). In the live notebook
 * these come from batch/online evaluations; here they are authored to be
 * statistically plausible and to tell a coherent "treatment wins" story.
 */

/** Baseline batch-evaluation scores (Step 4). 0..1. */
export const BASELINE_SCORES: EvaluatorScore[] = [
  { evaluatorId: "Builtin.GoalSuccessRate", label: "Goal Success Rate", score: 0.72 },
  { evaluatorId: "Builtin.Helpfulness", label: "Helpfulness", score: 0.81 },
  { evaluatorId: "Builtin.Correctness", label: "Correctness", score: 0.78 },
];

/**
 * Config-bundle A/B test results (Step 7): Control (original prompt) vs
 * Treatment T1 (recommended prompt + tool descriptions). Treatment wins.
 */
export const BUNDLE_AB_RESULTS: ABMetric[] = [
  {
    evaluatorId: "Builtin.GoalSuccessRate",
    label: "Goal Success Rate",
    control: { name: "C", mean: 0.72, sampleSize: 41 },
    variants: [
      {
        name: "T1",
        mean: 0.86,
        sampleSize: 39,
        pValue: 0.018,
        percentChange: 19.4,
        isSignificant: true,
      },
    ],
  },
  {
    evaluatorId: "Builtin.Helpfulness",
    label: "Helpfulness",
    control: { name: "C", mean: 0.81, sampleSize: 41 },
    variants: [
      {
        name: "T1",
        mean: 0.89,
        sampleSize: 39,
        pValue: 0.041,
        percentChange: 9.9,
        isSignificant: true,
      },
    ],
  },
];

/**
 * Target-based routing A/B results (Step 8): v1 (Control, 80%) vs
 * v2 (Treatment, 20% — adds escalate_to_hr_manager + better prompt).
 * The 20% treatment slice still has fewer sessions than control, so one
 * metric lands just short of significance — a realistic 80/20 read.
 */
export const TARGET_AB_RESULTS: ABMetric[] = [
  {
    evaluatorId: "Builtin.GoalSuccessRate",
    label: "Goal Success Rate",
    control: { name: "C", mean: 0.86, sampleSize: 42 },
    variants: [
      {
        name: "T1",
        mean: 0.93,
        sampleSize: 11,
        pValue: 0.039,
        percentChange: 8.1,
        isSignificant: true,
      },
    ],
  },
  {
    evaluatorId: "Builtin.Helpfulness",
    label: "Helpfulness",
    control: { name: "C", mean: 0.89, sampleSize: 42 },
    variants: [
      {
        name: "T1",
        mean: 0.92,
        sampleSize: 11,
        pValue: 0.14,
        percentChange: 3.4,
        isSignificant: false,
      },
    ],
  },
];
