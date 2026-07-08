import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { JourneyProvider } from "../state/journey";
import { Step5Insights } from "./Step5Insights";
import { SIM_FAILURES, SIM_USER_INTENTS, SIM_EXECUTION_SUMMARIES } from "../data/insights";
import { migrateSnapshot, type PersistedJourney } from "../lib/persistence";
import { STEP_ORDER, initialState } from "../state/journey";

describe("data: simulated insights", () => {
  it("failure tree has categories → subcategories → root causes with fixes", () => {
    expect(SIM_FAILURES.length).toBeGreaterThanOrEqual(3);
    for (const cat of SIM_FAILURES) {
      expect(cat.subCategories.length).toBeGreaterThan(0);
      for (const sub of cat.subCategories) {
        expect(sub.rootCauses.length).toBeGreaterThan(0);
        for (const rc of sub.rootCauses) {
          expect(rc.recommendation.length).toBeGreaterThan(20);
        }
      }
    }
  });

  it("intent + execution clusters exist", () => {
    expect(SIM_USER_INTENTS.length).toBeGreaterThanOrEqual(3);
    expect(SIM_EXECUTION_SUMMARIES.length).toBeGreaterThanOrEqual(3);
  });
});

describe("journey: 11-step order with insights", () => {
  it("insights sits between eval and recommend", () => {
    expect(STEP_ORDER).toHaveLength(11);
    expect(STEP_ORDER.indexOf("insights")).toBe(STEP_ORDER.indexOf("datasetEval") + 1);
    expect(STEP_ORDER.indexOf("recommend")).toBe(STEP_ORDER.indexOf("insights") + 1);
    expect(initialState().status.insights).toBe("locked");
  });
});

describe("persistence: old 9-step snapshot migration", () => {
  const base = (): PersistedJourney => ({
    started: true,
    activeStep: "recommend",
    // An old snapshot has no "insights" key at all.
    status: {
      config: "done",
      deploy: "done",
      baseline: "done",
      eval: "done",
      recommend: "active",
      bundles: "locked",
      bundleAB: "locked",
      targetAB: "locked",
      cleanup: "locked",
    } as PersistedJourney["status"],
    artifacts: {},
    mode: "sim",
  });

  it("derives insights=done when recommendations were reached", () => {
    const m = migrateSnapshot(base());
    expect((m.status as Record<string, string>).insights).toBe("done");
  });

  it("keeps insights locked when recommendations were not reached", () => {
    const s = base();
    (s.status as Record<string, string>).recommend = "locked";
    const m = migrateSnapshot(s);
    expect((m.status as Record<string, string>).insights).toBe("locked");
  });

  it("leaves fully-new snapshots untouched", () => {
    const s = base();
    (s.status as Record<string, string>).insights = "active";
    (s.status as Record<string, string>).datasetEval = "done";
    expect(migrateSnapshot(s)).toBe(s);
  });
});

describe("Step5Insights", () => {
  it("runs the analysis and reveals the triage report", async () => {
    render(
      <JourneyProvider>
        <Step5Insights />
      </JourneyProvider>,
    );
    // Empty until run.
    expect(screen.queryByTestId("insights-results")).not.toBeInTheDocument();

    vi.useFakeTimers();
    try {
      fireEvent.click(
        screen.getByRole("button", { name: /run insights analysis/i }),
      );
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });
    } finally {
      vi.useRealTimers();
    }

    const results = screen.getByTestId("insights-results");
    expect(results).toBeInTheDocument();
    // Failure tree with root cause + suggested fix.
    expect(screen.getByText("Incorrect actions")).toBeInTheDocument();
    expect(screen.getByText(/Employee ID not extracted/)).toBeInTheDocument();
    expect(screen.getAllByText(/Suggested fix/).length).toBeGreaterThan(0);
    // Intents + execution patterns.
    expect(screen.getByText("Check or use PTO")).toBeInTheDocument();
    expect(screen.getByText(/Single tool call, direct answer/)).toBeInTheDocument();
    // Advance affordance appears with the results.
    expect(
      screen.getByRole("button", { name: /continue to recommendations/i }),
    ).toBeInTheDocument();
  });
});
