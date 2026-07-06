import { describe, it, expect, vi, beforeEach } from "vitest";
import { LiveApi } from "./liveApi";

describe("LiveApi", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("builds URLs against the configured base", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: "ok" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const api = new LiveApi("/api");
    await api.health();
    expect(fetchMock).toHaveBeenCalledWith("/api/health", expect.anything());

    await api.getBundle("bndl-1");
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/bundles/bndl-1",
      expect.anything(),
    );
  });

  it("honors a custom base URL without doubling slashes", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);
    const api = new LiveApi("http://localhost:8787/api/");
    await api.getAbTest("ab-1");
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8787/api/abtest/ab-1",
      expect.anything(),
    );
  });

  it("throws LiveApiError on non-ok responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "Server Error",
        json: async () => ({ detail: "boom" }),
      }),
    );
    const api = new LiveApi();
    await expect(api.health()).rejects.toThrow(/boom/);
  });

  it("pollJob resolves with the result on completed", async () => {
    const states = [
      { id: "j1", state: "running" },
      { id: "j1", state: "completed", result: { runtime_arn: "arn:aws:x" } },
    ];
    let i = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async () => ({
        ok: true,
        json: async () => states[Math.min(i++, states.length - 1)],
      })),
    );
    const api = new LiveApi();
    const result = await api.pollJob<{ runtime_arn: string }>("j1", {
      sleep: async () => {},
      intervalMs: 0,
    });
    expect(result.runtime_arn).toBe("arn:aws:x");
  });

  it("pollJob rejects on failed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ id: "j1", state: "failed", error: "deploy blew up" }),
      }),
    );
    const api = new LiveApi();
    await expect(
      api.pollJob("j1", { sleep: async () => {}, intervalMs: 0 }),
    ).rejects.toThrow(/deploy blew up/);
  });

  it("pollJob times out when never terminal", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ id: "j1", state: "running" }),
      }),
    );
    const api = new LiveApi();
    await expect(
      api.pollJob("j1", { sleep: async () => {}, intervalMs: 0, timeoutMs: -1 }),
    ).rejects.toThrow(/timed out/);
  });
});
