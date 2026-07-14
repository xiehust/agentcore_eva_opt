import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { JourneyProvider } from "../../state/journey";
import { ConsoleProvider } from "../../state/console";
import { CleanupPage } from "./CleanupPage";
import type { ExperimentRecord } from "../../lib/liveApi";

const EXP: ExperimentRecord = {
  id: "e-1",
  name: "Exp 1",
  agentId: "a-1",
  agentName: "Champ",
  challengerAgentId: null,
  challengerAgentName: null,
  kind: "config_bundle",
  stage: "promoted",
  artifacts: {
    gatewayId: "gw-1",
    bundleAbTestId: "ab-1",
    targetAbTestId: "ab-2",
    controlBundleId: "b-c",
    treatmentBundleId: "b-t",
    targetIdV1: "tgt-1",
    targetIdV2: "tgt-2",
    onlineEvalIdV1: "oe-1",
    onlineEvalIdV2: "oe-2",
  },
  error: null,
  createdAt: 1,
  updatedAt: 1,
};

function stubFetch(experiments: ExperimentRecord[]) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fn = vi.fn().mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    const json = (body: unknown) => ({ ok: true, json: async () => body });
    if (url.endsWith("/cleanup")) {
      return json({
        results: [
          { category: "abtest:ab-1", status: "deleted", detail: "" },
          { category: "gateway", status: "deleted", detail: "" },
        ],
        deleted: 2,
        total: 2,
      });
    }
    if (/\/experiments\/[\w-]+$/.test(url)) return json(EXP);
    if (url.endsWith("/experiments")) return json({ experiments });
    if (url.includes("/session/")) return { ok: false, status: 404, statusText: "nf", json: async () => ({}) };
    return json({ ok: true });
  });
  return { fn, calls };
}

function renderPage() {
  return render(
    <JourneyProvider>
      <ConsoleProvider>
        <CleanupPage />
      </ConsoleProvider>
    </JourneyProvider>,
  );
}

describe("CleanupPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.removeItem("lab4.consoleSection");
  });

  it("renders resource chips from experiment artifacts", async () => {
    vi.stubGlobal("fetch", stubFetch([EXP]).fn);
    renderPage();
    expect(await screen.findByText("gw: gw-1")).toBeInTheDocument();
    expect(screen.getByText("ab: ab-1")).toBeInTheDocument();
    expect(screen.getByText("ab: ab-2")).toBeInTheDocument();
    expect(screen.getByText("bundle: b-c")).toBeInTheDocument();
    expect(screen.getByText("target: tgt-2")).toBeInTheDocument();
    expect(screen.getByText("eval: oe-2")).toBeInTheDocument();
  });

  it("teardown POSTs exactly the collected ids (no runtimes/roles)", async () => {
    const stub = stubFetch([EXP]);
    vi.stubGlobal("fetch", stub.fn);
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /delete aws resources/i }));
    await waitFor(() => {
      expect(stub.calls.some((c) => c.url.endsWith("/cleanup"))).toBe(true);
    });
    const post = stub.calls.find((c) => c.url.endsWith("/cleanup"));
    const body = JSON.parse(String(post!.init!.body));
    expect(body).toMatchObject({
      abTestIds: ["ab-1", "ab-2"],
      onlineEvalIds: ["oe-1", "oe-2"],
      bundleIds: ["b-c", "b-t"],
      gatewayId: "gw-1",
      targetIds: ["tgt-1", "tgt-2"],
    });
    expect(body.runtimeIds).toBeUndefined();
    expect(body.roleName).toBeUndefined();
    // Stage bumped to done with results persisted.
    const put = stub.calls.find(
      (c) => /\/experiments\/e-1$/.test(c.url) && c.init?.method === "PUT",
    );
    expect(JSON.parse(String(put!.init!.body))).toMatchObject({ stage: "done" });
  });

  it("renders the results table after cleanup", async () => {
    const cleaned: ExperimentRecord = {
      ...EXP,
      stage: "done",
      artifacts: {
        ...EXP.artifacts,
        cleanupResults: [
          { category: "abtest:ab-1", status: "deleted", detail: "" },
          { category: "gateway", status: "skipped", detail: "already gone" },
        ],
        cleanedAt: 1700000000,
      },
    };
    vi.stubGlobal("fetch", stubFetch([cleaned]).fn);
    renderPage();
    expect(await screen.findByText(/abtest:ab-1/)).toBeInTheDocument();
    expect(screen.getByText(/already gone/)).toBeInTheDocument();
  });

  it("shows the empty state without experiments", async () => {
    vi.stubGlobal("fetch", stubFetch([]).fn);
    renderPage();
    expect(await screen.findByText(/nothing to clean up/i)).toBeInTheDocument();
  });
});
