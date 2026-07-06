import { describe, it, expect, vi, beforeEach } from "vitest";
import { toSnapshot, isValidSnapshot, getSessionId } from "./persistence";
import { initialState, journeyReducer } from "../state/journey";

describe("persistence snapshot", () => {
  it("excludes credentials and identity from the snapshot", () => {
    let s = journeyReducer(initialState(), { type: "SET_MODE", mode: "live" });
    s = journeyReducer(s, {
      type: "SET_CREDS",
      creds: { accessKeyId: "AKIA", secretAccessKey: "shh" },
    });
    s = journeyReducer(s, {
      type: "SET_IDENTITY",
      identity: { account: "1", arn: "a", region: "us-west-2" },
    });
    s = journeyReducer(s, { type: "COMPLETE_STEP", step: "config", artifacts: { suffix: "x" } });

    const snap = toSnapshot(s);
    const serialized = JSON.stringify(snap);
    expect(serialized).not.toContain("AKIA");
    expect(serialized).not.toContain("shh");
    expect("liveCreds" in snap).toBe(false);
    expect("liveIdentity" in snap).toBe(false);
    // But real progress IS captured.
    expect(snap.mode).toBe("live");
    expect(snap.status.config).toBe("done");
    expect(snap.artifacts.suffix).toBe("x");
  });

  it("round-trips through HYDRATE, restoring progress", () => {
    const snap = toSnapshot(
      journeyReducer(initialState(), {
        type: "COMPLETE_STEP",
        step: "config",
        artifacts: { suffix: "abc" },
      }),
    );
    const restored = journeyReducer(initialState(), { type: "HYDRATE", snapshot: snap });
    expect(restored.status.config).toBe("done");
    expect(restored.status.deploy).toBe("active");
    expect(restored.artifacts.suffix).toBe("abc");
  });

  it("validates untrusted snapshots", () => {
    expect(isValidSnapshot(null)).toBe(false);
    expect(isValidSnapshot({ activeStep: "config" })).toBe(false); // missing status/mode
    expect(
      isValidSnapshot({ activeStep: "config", status: {}, mode: "sim" }),
    ).toBe(true);
    expect(
      isValidSnapshot({ activeStep: "config", status: {}, mode: "bogus" }),
    ).toBe(false);
  });
});

describe("getSessionId", () => {
  beforeEach(() => {
    const store: Record<string, string> = {};
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => {
        store[k] = v;
      },
    });
  });

  it("is stable across calls (persisted in localStorage)", () => {
    const a = getSessionId();
    const b = getSessionId();
    expect(a).toBe(b);
    expect(a.length).toBeGreaterThan(0);
  });
});
