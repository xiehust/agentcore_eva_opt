import { describe, it, expect } from "vitest";
import {
  journeyReducer,
  initialState,
  STEP_ORDER,
  isReachable,
} from "./journey";

describe("journeyReducer", () => {
  it("starts with step 1 active and the rest locked", () => {
    const s = initialState();
    expect(s.status.config).toBe("active");
    expect(s.status.deploy).toBe("locked");
    expect(s.started).toBe(false);
  });

  it("START_JOURNEY marks started and stays on config", () => {
    const s = journeyReducer(initialState(), { type: "START_JOURNEY" });
    expect(s.started).toBe(true);
    expect(s.activeStep).toBe("config");
  });

  it("completing a step unlocks the next and advances", () => {
    const s = journeyReducer(initialState(), {
      type: "COMPLETE_STEP",
      step: "config",
      artifacts: { suffix: "abc123" },
    });
    expect(s.status.config).toBe("done");
    expect(s.status.deploy).toBe("active");
    expect(s.activeStep).toBe("deploy");
    expect(s.artifacts.suffix).toBe("abc123");
  });

  it("does not navigate to a locked step", () => {
    const s = journeyReducer(initialState(), { type: "GO_TO", step: "cleanup" });
    expect(s.activeStep).toBe("config"); // unchanged
    expect(isReachable(s, "cleanup")).toBe(false);
  });

  it("navigates to an unlocked (done/active) step", () => {
    let s = journeyReducer(initialState(), {
      type: "COMPLETE_STEP",
      step: "config",
    });
    s = journeyReducer(s, { type: "GO_TO", step: "config" });
    expect(s.activeStep).toBe("config");
  });

  it("RESET returns to the initial locked state", () => {
    let s = journeyReducer(initialState(), {
      type: "COMPLETE_STEP",
      step: "config",
    });
    s = journeyReducer(s, { type: "RESET" });
    expect(s.status.deploy).toBe("locked");
    expect(s.activeStep).toBe("config");
    expect(s.started).toBe(false);
  });

  it("completing the final step does not crash (no next to unlock)", () => {
    const last = STEP_ORDER[STEP_ORDER.length - 1];
    const s = journeyReducer(initialState(), {
      type: "COMPLETE_STEP",
      step: last,
    });
    expect(s.status[last]).toBe("done");
    expect(s.activeStep).toBe(last);
  });

  // ─── Live-mode additions (must not disturb the sim defaults) ──────────────
  it("defaults to sim mode with no creds", () => {
    const s = initialState();
    expect(s.mode).toBe("sim");
    expect(s.liveCreds).toEqual({});
    expect(s.apiBase).toBe("/api");
  });

  it("SET_MODE / SET_CREDS / SET_IDENTITY update live state only", () => {
    let s = journeyReducer(initialState(), { type: "SET_MODE", mode: "live" });
    expect(s.mode).toBe("live");
    s = journeyReducer(s, { type: "SET_CREDS", creds: { region: "eu-west-1" } });
    expect(s.liveCreds.region).toBe("eu-west-1");
    s = journeyReducer(s, {
      type: "SET_IDENTITY",
      identity: { account: "1", arn: "a", region: "eu-west-1" },
    });
    expect(s.liveIdentity?.account).toBe("1");
    // The step machine is untouched by live actions.
    expect(s.status.config).toBe("active");
  });

  it("RESET preserves live setup but resets journey progress", () => {
    let s = journeyReducer(initialState(), { type: "SET_MODE", mode: "live" });
    s = journeyReducer(s, { type: "SET_CREDS", creds: { region: "eu-west-1" } });
    s = journeyReducer(s, { type: "COMPLETE_STEP", step: "config" });
    s = journeyReducer(s, { type: "RESET" });
    expect(s.status.deploy).toBe("locked"); // progress reset
    expect(s.mode).toBe("live"); // live setup preserved
    expect(s.liveCreds.region).toBe("eu-west-1");
  });

  it("in live mode, cleanup is reachable even while locked", () => {
    const live = journeyReducer(initialState(), { type: "SET_MODE", mode: "live" });
    const s = journeyReducer(live, { type: "GO_TO", step: "cleanup" });
    expect(s.activeStep).toBe("cleanup");
    // In sim mode the same jump is blocked.
    const sim = journeyReducer(initialState(), { type: "GO_TO", step: "cleanup" });
    expect(sim.activeStep).toBe("config");
  });
});
