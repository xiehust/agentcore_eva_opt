import { describe, it, expect } from "vitest";
import {
  BUILTIN_EVALUATORS,
  DEFAULT_EVALUATOR_IDS,
  CUSTOM_EVALUATOR_SAMPLE,
  simScoreFor,
} from "./evaluators";

describe("evaluator catalog", () => {
  it("has all 13 built-in evaluators", () => {
    expect(BUILTIN_EVALUATORS).toHaveLength(13);
    const ids = BUILTIN_EVALUATORS.map((e) => e.evaluatorId);
    expect(new Set(ids).size).toBe(13);
    ids.forEach((id) => expect(id).toMatch(/^Builtin\./));
  });

  it("covers the three evaluation levels", () => {
    const levels = new Set(BUILTIN_EVALUATORS.map((e) => e.level));
    expect(levels).toEqual(new Set(["SESSION", "TRACE", "TOOL_CALL"]));
    // GoalSuccessRate is the only session-level built-in.
    expect(
      BUILTIN_EVALUATORS.filter((e) => e.level === "SESSION").map(
        (e) => e.evaluatorId,
      ),
    ).toEqual(["Builtin.GoalSuccessRate"]);
  });

  it("default trio exists in the catalog with sim scores in 0..1", () => {
    for (const id of DEFAULT_EVALUATOR_IDS) {
      const e = BUILTIN_EVALUATORS.find((b) => b.evaluatorId === id);
      expect(e, id).toBeDefined();
    }
    BUILTIN_EVALUATORS.forEach((e) => {
      expect(e.simScore).toBeGreaterThanOrEqual(0);
      expect(e.simScore).toBeLessThanOrEqual(1);
    });
  });

  it("custom sample is a valid TRACE-level LLM judge config", () => {
    expect(CUSTOM_EVALUATOR_SAMPLE.level).toBe("TRACE");
    // TRACE placeholders required by CreateEvaluator.
    expect(CUSTOM_EVALUATOR_SAMPLE.instructions).toContain("{context}");
    expect(CUSTOM_EVALUATOR_SAMPLE.instructions).toContain("{assistant_turn}");
    // Numerical scale, values within 0..1, labels + definitions present.
    CUSTOM_EVALUATOR_SAMPLE.ratingScale.forEach((p) => {
      expect(p.value).toBeGreaterThanOrEqual(0);
      expect(p.value).toBeLessThanOrEqual(1);
      expect(p.label).toBeTruthy();
      expect(p.definition).toBeTruthy();
    });
  });

  it("simScoreFor falls back to the custom sample score", () => {
    expect(simScoreFor("Builtin.Coherence")).toBe(0.9);
    expect(simScoreFor("HRPolicyCompliance")).toBe(
      CUSTOM_EVALUATOR_SAMPLE.simScore,
    );
  });
});
