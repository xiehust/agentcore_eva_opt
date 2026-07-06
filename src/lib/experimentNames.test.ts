import { describe, expect, it } from "vitest";
import { experimentNames, sanitizeAlnum } from "./experimentNames";

// Service regexes (from the botocore models).
const GATEWAY_RE = /^([0-9a-zA-Z][-]?){1,48}$/;
const TARGET_RE = /^([0-9a-zA-Z][-]?){1,100}$/;
const AB_TEST_RE = /^[a-zA-Z][a-zA-Z0-9_]{0,47}$/;
const EVAL_RE = /^[a-zA-Z][a-zA-Z0-9_]{0,47}$/;

describe("experimentNames", () => {
  it("generates names matching every service constraint", () => {
    // Hex ids can start with a digit — the letter prefixes must cover that.
    const n = experimentNames("0d7e9823063d", "HR Assistant (sample)", "HR Assistant v2 (sample)");
    expect(n.gateway).toMatch(GATEWAY_RE);
    expect(n.targetV1).toMatch(TARGET_RE);
    expect(n.targetV2).toMatch(TARGET_RE);
    expect(n.onlineEvalV1).toMatch(EVAL_RE);
    expect(n.onlineEvalV2).toMatch(EVAL_RE);
    expect(n.bundleAbTest).toMatch(AB_TEST_RE);
    expect(n.targetAbTest).toMatch(AB_TEST_RE);
    expect(n.controlBundle).toMatch(AB_TEST_RE);
    expect(n.treatmentBundle).toMatch(AB_TEST_RE);
    expect(n.spRecommendation).toMatch(AB_TEST_RE);
    expect(n.tdRecommendation).toMatch(AB_TEST_RE);
  });

  it("AB test names contain no hyphens (learned the hard way)", () => {
    const n = experimentNames("abc-def_123!", "My Agent");
    expect(n.bundleAbTest).not.toContain("-");
    expect(n.targetAbTest).not.toContain("-");
  });

  it("disambiguates colliding champion/challenger target names", () => {
    const n = experimentNames("id1", "Same Name", "Same Name");
    expect(n.targetV1.slice(2)).not.toBe(n.targetV2.slice(2));
    expect(n.targetV2).toMatch(TARGET_RE);
  });

  it("handles empty/symbol-only agent names", () => {
    const n = experimentNames("id1", "!!!", undefined);
    expect(n.targetV1).toBe("t1agent");
    expect(n.targetV2).toBe("t2challenger");
  });

  it("sanitizeAlnum strips everything but alphanumerics", () => {
    expect(sanitizeAlnum("HR Assistant (sample) v2!")).toBe("HRAssistantsamplev2");
  });
});
