import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { JourneyProvider } from "../../state/journey";
import { ConsoleProvider } from "../../state/console";
import { RunsPage } from "./RunsPage";

const DEPLOYED_AGENT = {
  id: "a-1",
  name: "Agent One",
  description: "",
  requirements: [],
  deployment: { status: "deployed", runtimeArn: "arn:r1", serviceName: "s", region: "us-west-2" },
  kind: "managed",
  binding: null,
  createdAt: 1,
  updatedAt: 1,
};
const UNDEPLOYED_AGENT = { ...DEPLOYED_AGENT, id: "a-2", name: "Agent Two", deployment: null };
const EXTERNAL_AGENT = {
  ...DEPLOYED_AGENT,
  id: "a-3",
  name: "Ext Agent",
  deployment: null,
  kind: "external",
  binding: { serviceName: "ext-svc", logGroup: "/ext/lg", region: null, invoke: null },
};

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
  source: "dataset",
  createdAt: 1700000000,
  updatedAt: 1700000100,
};
const PASSIVE_RUN = {
  ...COMPLETED_RUN,
  id: "r-2",
  agentId: "a-3",
  agentName: "Ext Agent",
  datasetId: "",
  datasetName: "",
  agentArn: null,
  source: "lookback:24",
};

const LEGACY_DATASET = {
  id: "d-1",
  name: "DS",
  description: "",
  items: [{ prompt: "p" }],
  kind: "legacy",
  cloud: null,
  createdAt: 1,
  updatedAt: 1,
};

const SIMULATED_DATASET = {
  id: "d-sim",
  name: "Personas",
  description: "",
  items: [
    {
      scenario_id: "p1",
      actor_profile: { context: "c", goal: "g" },
      input: "hello",
      assertions: ["goal met"],
    },
  ],
  kind: "simulated",
  cloud: null,
  createdAt: 2,
  updatedAt: 2,
};

const SCENARIO_DATASET = {
  id: "d-scn",
  name: "Scenarios",
  description: "",
  items: [
    {
      scenario_id: "s1",
      turns: [{ input: "q", expected_response: "a" }],
      expected_trajectory: ["tool_a"],
      assertions: ["did it"],
    },
  ],
  kind: "predefined",
  cloud: null,
  createdAt: 3,
  updatedAt: 3,
};

function stubFetch({
  agents = [DEPLOYED_AGENT, UNDEPLOYED_AGENT],
  runs = [COMPLETED_RUN],
  datasets = [LEGACY_DATASET],
}: { agents?: unknown[]; runs?: unknown[]; datasets?: unknown[] } = {}) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const json = (body: unknown) => ({ ok: true, json: async () => body });
      if (url.endsWith("/agents")) return json({ agents });
      if (url.endsWith("/datasets")) return json({ datasets });
      if (url.endsWith("/runs") && init?.method === "POST") return json({ runId: "r-new", jobId: "j-new" });
      if (url.endsWith("/runs")) return json({ runs });
      if (url.includes("/jobs/")) return json({ id: "j-new", state: "completed", result: {} });
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

  it("offers deployed and external agents, but not undeployed managed ones", async () => {
    stubFetch({ agents: [DEPLOYED_AGENT, UNDEPLOYED_AGENT, EXTERNAL_AGENT] });
    renderPage();
    const select = (await screen.findAllByRole("combobox"))[0];
    const options = Array.from(select.querySelectorAll("option")).map((o) => o.textContent);
    expect(options).toContain("Agent One");
    expect(options).not.toContain("Agent Two");
    expect(options.some((o) => o?.startsWith("Ext Agent"))).toBe(true);
  });

  it("disables the dataset scope for external agents without an invoke endpoint", async () => {
    stubFetch({ agents: [EXTERNAL_AGENT], runs: [] });
    renderPage();
    const datasetRadio = await screen.findByRole("radio", { name: /dataset/i });
    expect(datasetRadio).toBeDisabled();
    expect(screen.getByRole("radio", { name: /time window/i })).toBeEnabled();
    expect(screen.getByRole("radio", { name: /session ids/i })).toBeEnabled();
    // Falls back to the lookback scope with its hours input.
    expect(screen.getByTestId("lookback-hours")).toBeInTheDocument();
    expect(screen.getByText(/invoke endpoint/i)).toBeInTheDocument();
  });

  it("starts a passive lookback run with exactly one scope field", async () => {
    stubFetch({ agents: [EXTERNAL_AGENT], runs: [] });
    const fetchMock = vi.mocked(fetch);
    renderPage();
    await screen.findByTestId("lookback-hours");
    fireEvent.change(screen.getByTestId("lookback-hours"), { target: { value: "48" } });
    fireEvent.click(screen.getByRole("button", { name: /start run/i }));
    await waitFor(() => {
      const post = fetchMock.mock.calls.find(
        ([url, init]) => String(url).endsWith("/runs") && init?.method === "POST",
      );
      expect(post).toBeDefined();
      const body = JSON.parse(String(post![1]!.body));
      expect(body).toMatchObject({ agentId: "a-3", lookbackHours: 48 });
      expect(body.datasetId).toBeUndefined();
      expect(body.sessionIds).toBeUndefined();
    });
  });

  it("enables the dataset scope for external agents WITH an invoke endpoint", async () => {
    const invokable = {
      ...EXTERNAL_AGENT,
      id: "a-4",
      name: "Inv Agent",
      binding: {
        ...EXTERNAL_AGENT.binding,
        invoke: { url: "http://127.0.0.1:9100/invoke" },
      },
    };
    stubFetch({ agents: [invokable], runs: [] });
    renderPage();
    const datasetRadio = await screen.findByRole("radio", { name: /dataset/i });
    expect(datasetRadio).toBeEnabled();
    expect(screen.queryByText(/invoke endpoint/i)).not.toBeInTheDocument();
  });

  it("renders passive run sources in history", async () => {
    stubFetch({ agents: [DEPLOYED_AGENT, EXTERNAL_AGENT], runs: [COMPLETED_RUN, PASSIVE_RUN] });
    renderPage();
    expect(await screen.findByText(/× DS/)).toBeInTheDocument();
    expect(screen.getByText(/× Lookback 24h/)).toBeInTheDocument();
  });

  it("shows the no-evaluable-agents hint and disables start when none exist", async () => {
    stubFetch({ agents: [UNDEPLOYED_AGENT], runs: [] });
    renderPage();
    expect(await screen.findByText(/no evaluable agents/i)).toBeInTheDocument();
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

  it("shows the simulation config only for simulated datasets and sends its model id", async () => {
    stubFetch({ datasets: [LEGACY_DATASET, SIMULATED_DATASET], runs: [] });
    const fetchMock = vi.mocked(fetch);
    renderPage();
    // Wait for the dataset select to be populated (option text includes the kind tag).
    await screen.findByText(/\[Simulated\] Personas/);
    // Legacy dataset selected by default → no sim config.
    expect(screen.queryByTestId("sim-config")).not.toBeInTheDocument();

    const selects = screen.getAllByRole("combobox");
    fireEvent.change(selects[1], { target: { value: "d-sim" } });
    expect(await screen.findByTestId("sim-config")).toBeInTheDocument();

    const modelInput = screen.getByTestId("sim-model-id") as HTMLInputElement;
    expect(modelInput.value).toBe("global.anthropic.claude-haiku-4-5-20251001-v1:0");
    fireEvent.change(modelInput, { target: { value: "my.actor-model" } });

    fireEvent.click(screen.getByRole("button", { name: /start run/i }));
    await waitFor(() => {
      const post = fetchMock.mock.calls.find(
        ([u, i]) => String(u).endsWith("/runs") && (i as RequestInit)?.method === "POST",
      );
      expect(post).toBeTruthy();
      const body = JSON.parse(String((post![1] as RequestInit).body));
      expect(body.datasetId).toBe("d-sim");
      expect(body.simulationModelId).toBe("my.actor-model");
    });
  });

  it("maps ground-truth fields to evaluators for scenario datasets", async () => {
    stubFetch({ datasets: [SCENARIO_DATASET], runs: [] });
    renderPage();
    const hints = await screen.findByTestId("gt-hints");
    // Correctness + GoalSuccessRate are in the default trio; trajectory
    // matchers are not selected, so only fields for CHECKED evaluators show.
    expect(hints.textContent).toContain("Builtin.Correctness ← expected_response");
    expect(hints.textContent).toContain("Builtin.GoalSuccessRate ← assertions");
    expect(hints.textContent).not.toContain("TrajectoryExactOrderMatch");
  });

  it("renders simulated-conversation transcripts on run detail", async () => {
    const simRun = {
      ...COMPLETED_RUN,
      id: "r-sim",
      transcripts: [
        {
          scenario_id: "p1",
          turns: 2,
          stopped_by: "goal",
          transcript: [
            { turn: 1, role: "user", text: "hello there" },
            { turn: 1, role: "agent", text: "hi, how can I help?" },
            { turn: 1, role: "actor_reasoning", text: "agent greeted me, ask about leave" },
            { turn: 2, role: "user", text: "book my leave" },
            { turn: 2, role: "agent", text: "done!" },
          ],
        },
      ],
    };
    stubFetch({ runs: [simRun] });
    renderPage();
    const transcripts = await screen.findByTestId("transcripts");
    expect(transcripts.textContent).toContain("p1");
    expect(transcripts.textContent).toContain("goal reached");
    expect(transcripts.textContent).toContain("hello there");
    expect(transcripts.textContent).toContain("agent greeted me, ask about leave");
    // Roles rendered in order: user before agent before reasoning.
    const text = transcripts.textContent!;
    expect(text.indexOf("hello there")).toBeLessThan(text.indexOf("hi, how can I help?"));
    expect(text.indexOf("hi, how can I help?")).toBeLessThan(text.indexOf("agent greeted me"));
  });

  it("shows no transcript section for runs without transcripts", async () => {
    stubFetch();
    renderPage();
    await screen.findByText("0.82");
    expect(screen.queryByTestId("transcripts")).not.toBeInTheDocument();
  });
});
