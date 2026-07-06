import { describe, it, expect } from "vitest";
import {
  CURRENT_SYSTEM_PROMPT,
  CURRENT_TOOL_DESCRIPTIONS,
  CURRENT_TOOLS,
  V2_TOOL_DESCRIPTIONS,
  V2_TOOLS,
  V2_EXTRA_TOOL,
} from "./agent";
import { BASELINE_PROMPTS, GW_PROMPTS, TARGET_PROMPTS } from "./prompts";
import {
  RECOMMENDED_SYSTEM_PROMPT,
  RECOMMENDED_TOOL_DESCRIPTIONS,
  recommendedIsRicher,
} from "./recommendations";
import { BASELINE_SCORES, BUNDLE_AB_RESULTS, TARGET_AB_RESULTS } from "./results";
import { CODE_SNIPPETS } from "./codeSnippets";

describe("agent data (verbatim from notebook)", () => {
  it("system prompt matches the notebook", () => {
    expect(CURRENT_SYSTEM_PROMPT).toContain(
      "You are a helpful HR Assistant for Acme Corp.",
    );
    expect(CURRENT_SYSTEM_PROMPT).toContain("Be concise, professional, and friendly.");
  });

  it("has exactly the 5 v1 tools", () => {
    expect(CURRENT_TOOLS).toHaveLength(5);
    expect(Object.keys(CURRENT_TOOL_DESCRIPTIONS)).toEqual([
      "get_pto_balance",
      "submit_pto_request",
      "lookup_hr_policy",
      "get_benefits_summary",
      "get_pay_stub",
    ]);
  });

  it("v2 adds escalate_to_hr_manager for 6 tools total", () => {
    expect(V2_TOOLS).toHaveLength(6);
    expect(Object.keys(V2_TOOL_DESCRIPTIONS)).toContain("escalate_to_hr_manager");
    expect(V2_EXTRA_TOOL.name).toBe("escalate_to_hr_manager");
  });
});

describe("prompts (verbatim counts)", () => {
  it("has 10 baseline prompts with employee IDs", () => {
    expect(BASELINE_PROMPTS).toHaveLength(10);
    expect(BASELINE_PROMPTS[0][0]).toBe("EMP-001");
    expect(BASELINE_PROMPTS[0][1]).toBe("What is my current PTO balance?");
  });

  it("has 20 gateway prompts and 10 target prompts", () => {
    expect(GW_PROMPTS).toHaveLength(20);
    expect(TARGET_PROMPTS).toHaveLength(10);
    expect(GW_PROMPTS.every((p) => p.startsWith("Employee ID:"))).toBe(true);
  });
});

describe("recommendations", () => {
  it("recommended system prompt differs from current", () => {
    expect(RECOMMENDED_SYSTEM_PROMPT).not.toBe(CURRENT_SYSTEM_PROMPT);
    expect(RECOMMENDED_SYSTEM_PROMPT.length).toBeGreaterThan(0);
  });

  it("every recommended tool description is longer than its original", () => {
    expect(recommendedIsRicher()).toBe(true);
    for (const key of Object.keys(CURRENT_TOOL_DESCRIPTIONS)) {
      expect(RECOMMENDED_TOOL_DESCRIPTIONS[key].length).toBeGreaterThan(
        CURRENT_TOOL_DESCRIPTIONS[key].length,
      );
    }
  });
});

describe("results", () => {
  it("baseline has 3 evaluators with 0..1 scores", () => {
    expect(BASELINE_SCORES).toHaveLength(3);
    for (const s of BASELINE_SCORES) {
      expect(s.score).toBeGreaterThan(0);
      expect(s.score).toBeLessThanOrEqual(1);
    }
  });

  it("bundle A/B results carry pValue, percentChange, isSignificant for >=2 evaluators", () => {
    expect(BUNDLE_AB_RESULTS.length).toBeGreaterThanOrEqual(2);
    for (const m of BUNDLE_AB_RESULTS) {
      const v = m.variants[0];
      expect(typeof v.pValue).toBe("number");
      expect(typeof v.percentChange).toBe("number");
      expect(typeof v.isSignificant).toBe("boolean");
    }
  });

  it("target A/B results model a canary (small T1 sample, mixed significance)", () => {
    expect(TARGET_AB_RESULTS.length).toBeGreaterThanOrEqual(2);
    const t1 = TARGET_AB_RESULTS[0].variants[0];
    expect(t1.sampleSize).toBeLessThan(TARGET_AB_RESULTS[0].control.sampleSize);
  });
});

describe("code snippets", () => {
  it("has a boto3 snippet for all 9 steps", () => {
    const keys = [
      "config",
      "deploy",
      "baseline",
      "eval",
      "recommend",
      "bundles",
      "bundleAB",
      "targetAB",
      "cleanup",
    ] as const;
    for (const k of keys) {
      expect(CODE_SNIPPETS[k]).toBeTruthy();
      expect(CODE_SNIPPETS[k].length).toBeGreaterThan(20);
    }
  });
});
