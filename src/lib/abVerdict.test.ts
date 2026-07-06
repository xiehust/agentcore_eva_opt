import { describe, it, expect } from "vitest";
import { promoteVerdict, verdictSentence, fmtPct } from "./abVerdict";
import type { ABMetric } from "../sim/types";

function metric(label: string, pct: number, significant = false): ABMetric {
  return {
    evaluatorId: `arn/${label}`,
    label,
    control: { name: "C", mean: 0.8, sampleSize: 10 },
    variants: [
      {
        name: "T1",
        mean: 0.8 * (1 + pct / 100),
        sampleSize: 9,
        pValue: significant ? 0.01 : 0.5,
        percentChange: pct,
        isSignificant: significant,
      },
    ],
  };
}

describe("promoteVerdict", () => {
  it("returns null with no metrics", () => {
    expect(promoteVerdict([])).toBeNull();
  });

  it("win when every metric improved", () => {
    const v = promoteVerdict([metric("Goal", 2.1, true), metric("Help", 5.0)])!;
    expect(v.status).toBe("win");
    expect(v.improvedCount).toBe(2);
    expect(v.significant).toBe(true);
    expect(v.summary).toBe("Goal +2.1%, Help +5.0%");
  });

  it("loss when no metric improved (the real live result)", () => {
    const v = promoteVerdict([metric("Goal", -14.3), metric("Help", -7.9)])!;
    expect(v.status).toBe("loss");
    expect(v.improvedCount).toBe(0);
    expect(v.significant).toBe(false);
    expect(v.summary).toBe("Goal −14.3%, Help −7.9%");
  });

  it("mixed when some improved", () => {
    const v = promoteVerdict([metric("Goal", 3.0), metric("Help", -2.0)])!;
    expect(v.status).toBe("mixed");
    expect(v.improvedCount).toBe(1);
  });

  it("significance only counts improved metrics (a significant regression is not a win)", () => {
    const v = promoteVerdict([metric("Goal", -10, true), metric("Help", -5)])!;
    expect(v.status).toBe("loss");
    expect(v.significant).toBe(false);
  });
});

describe("verdictSentence", () => {
  it("win sentence names the metrics and significance", () => {
    const s = verdictSentence(promoteVerdict([metric("Goal", 2.1, true), metric("Help", 5.0)])!);
    expect(s).toContain("improved on both metrics");
    expect(s).toContain("statistically significant");
    expect(s).not.toContain("not statistically");
  });

  it("loss sentence suggests more sessions and does not claim a win", () => {
    const s = verdictSentence(promoteVerdict([metric("Goal", -14.3), metric("Help", -7.9)])!);
    expect(s).toContain("did not beat the control");
    expect(s).toContain("more sessions");
    expect(s).not.toContain("T1 won");
  });
});

describe("fmtPct", () => {
  it("uses a real minus sign and one decimal", () => {
    expect(fmtPct(-14.28)).toBe("−14.3%");
    expect(fmtPct(5)).toBe("+5.0%");
  });
});
