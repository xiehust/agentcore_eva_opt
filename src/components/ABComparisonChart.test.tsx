import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ABComparisonChart } from "./ABComparisonChart";
import { BUNDLE_AB_RESULTS } from "../data/results";

describe("ABComparisonChart", () => {
  it("renders a chart container and a row per evaluator", () => {
    render(<ABComparisonChart metrics={BUNDLE_AB_RESULTS} />);
    expect(screen.getByTestId("ab-chart")).toBeInTheDocument();
    // One label per evaluator appears (in the significance rows).
    for (const m of BUNDLE_AB_RESULTS) {
      expect(screen.getAllByText(m.label).length).toBeGreaterThan(0);
    }
  });

  it("shows significance badges and percent change", () => {
    render(<ABComparisonChart metrics={BUNDLE_AB_RESULTS} />);
    // Both bundle metrics are significant in the fixture.
    expect(screen.getAllByText(/significant/i).length).toBe(
      BUNDLE_AB_RESULTS.length,
    );
    // Percent change for the first metric is rendered.
    const pct = BUNDLE_AB_RESULTS[0].variants[0].percentChange.toFixed(1);
    expect(screen.getByText(new RegExp(`\\+${pct}%`))).toBeInTheDocument();
  });
});
