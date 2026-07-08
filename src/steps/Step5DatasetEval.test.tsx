import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { JourneyProvider, STEP_ORDER, initialState } from "../state/journey";
import { migrateSnapshot, type PersistedJourney } from "../lib/persistence";
import { Step5DatasetEval } from "./Step5DatasetEval";
import { CODE_SNIPPETS } from "../data/codeSnippets";
import {
  SIM_DATASET_EVAL_RESULTS,
  SIM_PREDEFINED_SCENARIOS,
  SIM_SIMULATED_SCENARIOS,
  SIM_SIMULATION_TRANSCRIPTS,
} from "../data/datasetEval";
import { STEPS } from "./manifest";

describe("journey: 11-step order with datasetEval", () => {
  it("datasetEval sits between eval and insights at index 4", () => {
    expect(STEP_ORDER).toHaveLength(11);
    expect(STEP_ORDER.indexOf("datasetEval")).toBe(4);
    expect(STEP_ORDER.indexOf("datasetEval")).toBe(STEP_ORDER.indexOf("eval") + 1);
    expect(STEP_ORDER.indexOf("insights")).toBe(STEP_ORDER.indexOf("datasetEval") + 1);
    expect(initialState().status.datasetEval).toBe("locked");
  });

  it("is registered in the manifest with a component and sequential indices", () => {
    expect(STEPS).toHaveLength(11);
    const def = STEPS.find((s) => s.key === "datasetEval");
    expect(def?.component).toBe(Step5DatasetEval);
    expect(STEPS.map((s) => s.index)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });

  it("code reveal contains the SDK dataset-runner snippets", () => {
    expect(CODE_SNIPPETS.datasetEval).toContain("run_dataset_evaluation");
    expect(CODE_SNIPPETS.datasetEval).toContain("SimulatedScenario");
    expect(CODE_SNIPPETS.datasetEval).toContain("ActorProfile");
    expect(CODE_SNIPPETS.datasetEval).toContain("SimulationConfig");
  });
});

describe("persistence: snapshot migrations compose", () => {
  const base = (status: Record<string, string>): PersistedJourney => ({
    started: true,
    activeStep: "recommend",
    status: status as PersistedJourney["status"],
    artifacts: {},
    mode: "sim",
  });

  it("migrates a 10-step snapshot (insights done) → datasetEval done", () => {
    const m = migrateSnapshot(
      base({ config: "done", deploy: "done", baseline: "done", eval: "done", insights: "done", recommend: "active" }),
    );
    expect((m.status as Record<string, string>).datasetEval).toBe("done");
  });

  it("migrates a 10-step snapshot (insights locked) → datasetEval locked", () => {
    const m = migrateSnapshot(
      base({ config: "done", deploy: "done", baseline: "active", eval: "locked", insights: "locked", recommend: "locked" }),
    );
    expect((m.status as Record<string, string>).datasetEval).toBe("locked");
  });

  it("migrates a 9-step snapshot through BOTH migrations", () => {
    // Pre-insights snapshot: no insights key, no datasetEval key.
    const m = migrateSnapshot(
      base({ config: "done", deploy: "done", baseline: "done", eval: "done", recommend: "active" }),
    );
    const status = m.status as Record<string, string>;
    expect(status.insights).toBe("done"); // migration 1
    expect(status.datasetEval).toBe("done"); // migration 2 chains off it
  });

  it("keeps datasetEval locked for a 9-step snapshot that never reached recommend", () => {
    const m = migrateSnapshot(
      base({ config: "done", deploy: "active", baseline: "locked", eval: "locked", recommend: "locked" }),
    );
    const status = m.status as Record<string, string>;
    expect(status.insights).toBe("locked");
    expect(status.datasetEval).toBe("locked");
  });
});

describe("Step5DatasetEval", () => {
  function renderStep() {
    return render(
      <JourneyProvider>
        <Step5DatasetEval />
      </JourneyProvider>,
    );
  }

  it("renders scenario and persona cards from the authored data", () => {
    renderStep();
    const cards = screen.getByTestId("scenario-cards");
    for (const sc of SIM_PREDEFINED_SCENARIOS) {
      expect(cards.textContent).toContain(sc.scenario_id);
    }
    const personas = screen.getByTestId("persona-cards");
    for (const sc of SIM_SIMULATED_SCENARIOS) {
      expect(personas.textContent).toContain(sc.scenario_id);
    }
    // Results hidden until run.
    expect(screen.queryByTestId("dataset-eval-results")).not.toBeInTheDocument();
    expect(screen.queryByTestId("sim-transcripts")).not.toBeInTheDocument();
  });

  it("runs both demos and reveals results + transcripts (deterministic)", async () => {
    renderStep();
    vi.useFakeTimers();
    try {
      fireEvent.click(screen.getByRole("button", { name: /run dataset evaluation/i }));
      await vi.advanceTimersByTimeAsync(5000);
      const results = screen.getByTestId("dataset-eval-results");
      // Per-scenario rows incl. the deliberate failure, red-scored.
      for (const row of SIM_DATASET_EVAL_RESULTS) {
        expect(results.textContent).toContain(row.scenario_id);
      }
      expect(results.textContent).toContain("0.41"); // failing Correctness value

      fireEvent.click(screen.getByRole("button", { name: /run user simulation/i }));
      await vi.advanceTimersByTimeAsync(5000);
      const transcripts = screen.getByTestId("sim-transcripts");
      expect(transcripts.textContent).toContain("goal reached");
      expect(transcripts.textContent).toContain("max turns");
      // Actor reasoning surfaces in the playback.
      const reasoning = SIM_SIMULATION_TRANSCRIPTS[0].transcript.find(
        (e) => e.role === "actor_reasoning",
      )!;
      expect(transcripts.textContent).toContain(reasoning.text);
    } finally {
      vi.useRealTimers();
    }
  });

  it("is deterministic across two mounts (authored data, no randomness)", async () => {
    vi.useFakeTimers();
    try {
      renderStep();
      fireEvent.click(screen.getByRole("button", { name: /run dataset evaluation/i }));
      await vi.advanceTimersByTimeAsync(5000);
      const first = screen.getByTestId("dataset-eval-results").textContent;
      cleanup();

      renderStep();
      fireEvent.click(screen.getByRole("button", { name: /run dataset evaluation/i }));
      await vi.advanceTimersByTimeAsync(5000);
      const second = screen.getByTestId("dataset-eval-results").textContent;
      expect(second).toBe(first);
    } finally {
      vi.useRealTimers();
    }
  });
});
