import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { JourneyProvider } from "../../state/journey";
import { ConsoleProvider } from "../../state/console";
import { RunsPage } from "./RunsPage";

const DEPLOYED_AGENT = {
  id: "a-1",
  name: "Agent One",
  description: "",
  requirements: [],
  deployment: { status: "deployed", runtimeArn: "arn:r1", serviceName: "s", region: "us-west-2" },
  createdAt: 1,
  updatedAt: 1,
};
const UNDEPLOYED_AGENT = { ...DEPLOYED_AGENT, id: "a-2", name: "Agent Two", deployment: null };

const COMPLETED_RUN = {
  id: "r-1",
  agentId: "a-1",
  datasetId: "d-1",
  agentName: "Agent One",
  datasetName: "DS",
  agentArn: "arn:r1",
  evaluators: ["Builtin.Helpfulness"],
  sessionIds: ["s1", "s2"],
  batchEvaluationId: "be-1",
  scores: [{ evaluatorId: "Builtin.Helpfulness", score: 0.82 }],
  status: "completed",
  error: null,
  jobId: "j-1",
  createdAt: 1700000000,
  updatedAt: 1700000100,
};

function stubFetch({ agents = [DEPLOYED_AGENT, UNDEPLOYED_AGENT], runs = [COMPLETED_RUN] } = {}) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      const json = (body: unknown) => ({ ok: true, json: async () => body });
      if (url.endsWith("/agents")) return json({ agents });
      if (url.endsWith("/datasets")) return json({ datasets: [{ id: "d-1", name: "DS", description: "", items: [{ prompt: "p" }], createdAt: 1, updatedAt: 1 }] });
      if (url.endsWith("/runs")) return json({ runs });
      if (url.endsWith("/evaluators/list")) return json({ evaluators: [] });
      if (url.includes("/session/")) return { ok: false, status: 404, statusText: "nf", json: async () => ({}) };
      return json({ ok: true });
    }),
  );
}

function renderPage() {
  return render(
    <JourneyProvider>
      <ConsoleProvider>
        <RunsPage />
      </ConsoleProvider>
    </JourneyProvider>,
  );
}

describe("RunsPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.removeItem("lab4.consoleSection");
  });

  it("only offers deployed agents in the agent selector", async () => {
    stubFetch();
    renderPage();
    const select = (await screen.findAllByRole("combobox"))[0];
    const options = Array.from(select.querySelectorAll("option")).map((o) => o.textContent);
    expect(options).toContain("Agent One");
    expect(options).not.toContain("Agent Two");
  });

  it("shows the no-deployed-agents hint and disables start when none exist", async () => {
    stubFetch({ agents: [UNDEPLOYED_AGENT], runs: [] });
    renderPage();
    expect(await screen.findByText(/no deployed agents/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /start run/i })).toBeDisabled();
  });

  it("renders history with status badge and ScoreCards for the selected run", async () => {
    stubFetch();
    renderPage();
    // "Agent One" appears both as a select option and in the history row.
    expect((await screen.findAllByText("Agent One")).length).toBeGreaterThan(1);
    expect(screen.getByText(/× DS/)).toBeInTheDocument();
    // Score tile with the 0.82 value ("Helpfulness" also appears as a checkbox).
    expect(await screen.findByText("0.82")).toBeInTheDocument();
    expect(screen.getByText(/2 sessions/i)).toBeInTheDocument();
    expect(screen.getByText(/be-1/)).toBeInTheDocument();
  });
});
