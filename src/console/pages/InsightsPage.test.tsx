import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { JourneyProvider } from "../../state/journey";
import { ConsoleProvider } from "../../state/console";
import { InsightsPage } from "./InsightsPage";
import type { AgentRecord, InsightReportRecord, RunRecord } from "../../lib/liveApi";

const AGENT: AgentRecord = {
  id: "a-1",
  name: "HR Assistant",
  description: "",
  requirements: [],
  deployment: {
    status: "deployed",
    runtimeArn: "arn:x",
    logGroup: "/aws/x",
    serviceName: "X.DEFAULT",
  },
  config: null,
  createdAt: 1,
  updatedAt: 1,
};

const RUN: RunRecord = {
  id: "run-1",
  agentId: "a-1",
  datasetId: "d-1",
  agentName: "HR Assistant",
  datasetName: "Failure prompts",
  agentArn: "arn:x",
  evaluators: [],
  sessionIds: ["s-1", "s-2"],
  batchEvaluationId: "be-1",
  scores: [],
  status: "completed",
  error: null,
  jobId: null,
  createdAt: 10,
  updatedAt: 10,
};

const REPORT: InsightReportRecord = {
  id: "rep-1",
  agentId: "a-1",
  agentName: "HR Assistant",
  source: "run:run-1",
  insights: ["Builtin.Insight.FailureAnalysis"],
  sessionIds: ["s-1", "s-2"],
  timeRange: null,
  batchEvaluationId: "be-ins-1",
  results: {
    failures: [
      {
        name: "Execution errors",
        description: "Tool lookups failing",
        affectedSessionCount: 5,
        subCategories: [
          {
            name: "Resource not found",
            affectedSessionCount: 5,
            rootCauses: [
              {
                name: "Unknown employee IDs",
                recommendation: "Validate IDs before lookup",
                affectedSessionCount: 5,
              },
            ],
          },
        ],
      },
    ],
    userIntents: [
      {
        name: "PTO balance checks",
        description: "Users asking for PTO balances",
        affectedSessionCount: 4,
      },
    ],
    executionSummaries: [
      {
        name: "Single tool lookup",
        description: "One lookup then answer",
        affectedSessionCount: 7,
      },
    ],
  },
  status: "completed",
  error: null,
  jobId: "job-1",
  createdAt: 20,
  updatedAt: 20,
};

function stubFetch(reports: InsightReportRecord[]) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fn = vi.fn().mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    const json = (body: unknown) => ({ ok: true, json: async () => body });
    if (url.endsWith("/agents")) return json({ agents: [AGENT] });
    if (url.endsWith("/runs")) return json({ runs: [RUN] });
    if (url.endsWith("/insights") && init?.method === "POST") {
      return json({ reportId: "rep-new", jobId: "job-new" });
    }
    if (url.endsWith("/insights")) return json({ reports });
    if (url.includes("/jobs/")) {
      return json({ id: "job-new", state: "completed", result: {} });
    }
    if (url.includes("/session/")) {
      return { ok: false, status: 404, statusText: "nf", json: async () => ({}) };
    }
    return json({ ok: true });
  });
  return { fn, calls };
}

function renderPage() {
  return render(
    <JourneyProvider>
      <ConsoleProvider>
        <InsightsPage />
      </ConsoleProvider>
    </JourneyProvider>,
  );
}

describe("InsightsPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.removeItem("lab4.consoleSection");
  });

  it("renders the three insight type checkboxes, all selected", async () => {
    vi.stubGlobal("fetch", stubFetch([]).fn);
    renderPage();
    expect(await screen.findByText("Failure analysis")).toBeInTheDocument();
    expect(screen.getByText("User intent")).toBeInTheDocument();
    expect(screen.getByText("Execution summary")).toBeInTheDocument();
    const boxes = screen.getAllByRole("checkbox");
    expect(boxes).toHaveLength(3);
    boxes.forEach((b) => expect(b).toBeChecked());
  });

  it("run scope: lists the agent's runs with sessions", async () => {
    vi.stubGlobal("fetch", stubFetch([]).fn);
    renderPage();
    expect(await screen.findByRole("option", { name: /Failure prompts/ })).toBeInTheDocument();
  });

  it("POSTs runId scope with selected insights", async () => {
    const stub = stubFetch([]);
    vi.stubGlobal("fetch", stub.fn);
    renderPage();
    // Unselect ExecutionSummary, keep the other two.
    fireEvent.click(await screen.findByText("Execution summary"));
    fireEvent.click(screen.getByRole("button", { name: /run insights analysis/i }));
    await waitFor(() => {
      expect(
        stub.calls.some((c) => c.url.endsWith("/insights") && c.init?.method === "POST"),
      ).toBe(true);
    });
    const post = stub.calls.find(
      (c) => c.url.endsWith("/insights") && c.init?.method === "POST",
    );
    const body = JSON.parse(String(post!.init!.body));
    expect(body).toMatchObject({ agentId: "a-1", runId: "run-1" });
    expect(body.lookbackHours).toBeUndefined();
    expect(body.insights).toEqual([
      "Builtin.Insight.FailureAnalysis",
      "Builtin.Insight.UserIntent",
    ]);
  });

  it("lookback scope: POSTs lookbackHours instead of runId", async () => {
    const stub = stubFetch([]);
    vi.stubGlobal("fetch", stub.fn);
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /recent time window/i }));
    fireEvent.change(screen.getByLabelText(/lookback hours/i), { target: { value: "48" } });
    fireEvent.click(screen.getByRole("button", { name: /run insights analysis/i }));
    await waitFor(() => {
      expect(
        stub.calls.some((c) => c.url.endsWith("/insights") && c.init?.method === "POST"),
      ).toBe(true);
    });
    const post = stub.calls.find(
      (c) => c.url.endsWith("/insights") && c.init?.method === "POST",
    );
    const body = JSON.parse(String(post!.init!.body));
    expect(body).toMatchObject({ agentId: "a-1", lookbackHours: 48 });
    expect(body.runId).toBeUndefined();
  });

  it("renders a completed report: failure tree, intents, execution patterns", async () => {
    vi.stubGlobal("fetch", stubFetch([REPORT]).fn);
    renderPage();
    // Failure tree with recommendation highlighted.
    expect(await screen.findByText("Execution errors")).toBeInTheDocument();
    expect(screen.getByText("Resource not found")).toBeInTheDocument();
    expect(screen.getByText("Unknown employee IDs")).toBeInTheDocument();
    expect(screen.getByText(/Validate IDs before lookup/)).toBeInTheDocument();
    // Intent + execution clusters.
    expect(screen.getByText("PTO balance checks")).toBeInTheDocument();
    expect(screen.getByText("Single tool lookup")).toBeInTheDocument();
    // Handoff hint toward Experiments.
    expect(screen.getByText(/optimization experiment/i)).toBeInTheDocument();
  });

  it("shows a resume button for an in-flight report", async () => {
    vi.stubGlobal(
      "fetch",
      stubFetch([{ ...REPORT, status: "analyzing", results: null }]).fn,
    );
    renderPage();
    expect(
      await screen.findByRole("button", { name: /resume polling/i }),
    ).toBeInTheDocument();
  });

  it("empty history state", async () => {
    vi.stubGlobal("fetch", stubFetch([]).fn);
    renderPage();
    expect(await screen.findByText(/no insight reports yet/i)).toBeInTheDocument();
  });
});
