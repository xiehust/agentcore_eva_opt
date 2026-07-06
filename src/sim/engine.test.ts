import { describe, it, expect } from "vitest";
import {
  makeSuffix,
  fakeArn,
  fakeId,
  simulateAsync,
  deployStages,
  pollStages,
  evalStages,
  FAKE_ACCOUNT_ID,
  CLEANUP_ITEMS,
} from "./engine";
import type { SimProgress } from "./types";

describe("makeSuffix", () => {
  it("is deterministic for a given seed", () => {
    expect(makeSuffix(42)).toBe(makeSuffix(42));
    expect(makeSuffix(7)).toBe(makeSuffix(7));
  });

  it("produces a 6-char lowercase hex string", () => {
    const s = makeSuffix(123);
    expect(s).toMatch(/^[0-9a-f]{6}$/);
  });

  it("varies across seeds", () => {
    expect(makeSuffix(1)).not.toBe(makeSuffix(2));
  });
});

describe("fakeArn / fakeId", () => {
  it("emits a bedrock-agentcore ARN with the fake account id", () => {
    const arn = fakeArn("bedrock-agentcore", "runtime", "HRAssistV1abc123");
    expect(arn).toMatch(/^arn:aws:bedrock-agentcore:/);
    expect(arn).toContain(FAKE_ACCOUNT_ID);
  });

  it("never emits a caller-supplied account id (always the fake one)", () => {
    const arn = fakeArn("bedrock-agentcore", "runtime", "x", {
      accountId: "999999999999",
    });
    expect(arn).toContain("123456789012");
    expect(arn).not.toContain("999999999999");
  });

  it("fakeId is deterministic with a seed", () => {
    expect(fakeId("bndl-", 9)).toBe(fakeId("bndl-", 9));
  });
});

describe("simulateAsync", () => {
  it("emits running+done for every stage in order, then resolves", async () => {
    const stages = deployStages();
    const events: SimProgress[] = [];
    await simulateAsync(stages, { speed: 0, onProgress: (p) => events.push(p) });

    // 2 events (running, done) per stage.
    expect(events.length).toBe(stages.length * 2);
    // Stage indices are monotonic non-decreasing.
    const indices = events.map((e) => e.index);
    expect(indices).toEqual([...indices].sort((a, b) => a - b));
    // First event is stage 0 running; last is final stage done.
    expect(events[0]).toMatchObject({ index: 0, status: "running" });
    expect(events.at(-1)).toMatchObject({
      index: stages.length - 1,
      status: "done",
    });
  });

  it("deploy sequence has >=5 stages ending in ACTIVE", () => {
    const stages = deployStages();
    expect(stages.length).toBeGreaterThanOrEqual(5);
    expect(stages.at(-1)?.terminal).toBe("ACTIVE");
  });

  it("respects an abort signal", async () => {
    const ac = new AbortController();
    ac.abort();
    const events: SimProgress[] = [];
    await simulateAsync(pollStages("gateway"), {
      speed: 0,
      signal: ac.signal,
      onProgress: (p) => events.push(p),
    });
    expect(events.length).toBe(0);
  });

  it("eval sequence terminates COMPLETED", () => {
    expect(evalStages("batch evaluation").at(-1)?.terminal).toBe("COMPLETED");
  });
});

describe("cleanup items", () => {
  it("covers at least 7 resource categories", () => {
    expect(CLEANUP_ITEMS.length).toBeGreaterThanOrEqual(7);
  });
});
