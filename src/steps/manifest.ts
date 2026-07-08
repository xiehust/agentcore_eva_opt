import type { ComponentType } from "react";
import type { StepKey } from "../data/codeSnippets";
import { Step1Config } from "./Step1Config";
import { Step2Deploy } from "./Step2Deploy";
import { Step3Baseline } from "./Step3Baseline";
import { Step4Eval } from "./Step4Eval";
import { Step5DatasetEval } from "./Step5DatasetEval";
import { Step5Insights } from "./Step5Insights";
import { Step5Recommend } from "./Step5Recommend";
import { Step6Bundles } from "./Step6Bundles";
import { Step7BundleAB } from "./Step7BundleAB";
import { Step8TargetAB } from "./Step8TargetAB";
import { Step9Cleanup } from "./Step9Cleanup";

export interface StepDef {
  key: StepKey;
  index: number;
  title: string;
  shortTitle: string;
  component: ComponentType;
}

/** Ordered 11-step manifest: notebook Steps 1–9 + Dataset Eval & Insights at 5–6. */
export const STEPS: StepDef[] = [
  { key: "config", index: 1, title: "Configuration", shortTitle: "Configure", component: Step1Config },
  { key: "deploy", index: 2, title: "Deploy HR Assistant v1", shortTitle: "Deploy v1", component: Step2Deploy },
  { key: "baseline", index: 3, title: "Baseline Bundle & Traffic", shortTitle: "Baseline", component: Step3Baseline },
  { key: "eval", index: 4, title: "Baseline Batch Evaluation", shortTitle: "Evaluate", component: Step4Eval },
  { key: "datasetEval", index: 5, title: "Dataset Evaluation & User Simulation", shortTitle: "Dataset Eval", component: Step5DatasetEval },
  { key: "insights", index: 6, title: "Failure Insights", shortTitle: "Insights", component: Step5Insights },
  { key: "recommend", index: 7, title: "Optimization Recommendations", shortTitle: "Recommend", component: Step5Recommend },
  { key: "bundles", index: 8, title: "Configuration Bundles", shortTitle: "Bundles", component: Step6Bundles },
  { key: "bundleAB", index: 9, title: "A/B Test — Config Bundle Routing", shortTitle: "Bundle A/B", component: Step7BundleAB },
  { key: "targetAB", index: 10, title: "A/B Test — Target-Based Routing", shortTitle: "Target A/B", component: Step8TargetAB },
  { key: "cleanup", index: 11, title: "Cleanup", shortTitle: "Cleanup", component: Step9Cleanup },
];

export function getStep(key: StepKey): StepDef {
  const s = STEPS.find((x) => x.key === key);
  if (!s) throw new Error(`Unknown step: ${key}`);
  return s;
}
