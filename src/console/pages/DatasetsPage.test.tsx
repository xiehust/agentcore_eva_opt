import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { JourneyProvider } from "../../state/journey";
import { ConsoleProvider } from "../../state/console";
import { DatasetsPage } from "./DatasetsPage";
import { validateScenarioJson } from "../../lib/scenarioValidation";

const LEGACY_DS = {
  id: "d-1",
  name: "Legacy DS",
  description: "",
  items: [{ prompt: "p1" }],
  kind: "legacy",
  cloud: null,
  createdAt: 1,
  updatedAt: 1,
};

const SCENARIO_DS = {
  id: "d-2",
  name: "Scenario DS",
  description: "",
  items: [
    { scenario_id: "s1", turns: [{ input: "q1" }, { input: "q2" }] },
    { scenario_id: "s2", turns: [{ input: "q3" }] },
  ],
  kind: "predefined",
  cloud: { datasetId: "cloud-1", status: "ACTIVE", exampleCount: 2 },
  createdAt: 2,
  updatedAt: 2,
};

const SCENARIO_SAMPLE = {
  key: "scenario",
  name: "HR scenario dataset (sample)",
  description: "",
  kind: "predefined",
  items: [{ scenario_id: "hr1", turns: [{ input: "hi" }] }],
};
const SIMULATED_SAMPLE = {
  key: "simulated",
  name: "HR simulated personas (sample)",
  description: "",
  kind: "simulated",
  items: [
    {
      scenario_id: "p1",
      actor_profile: { context: "c", goal: "g" },
      input: "hello",
      max_turns: 5,
    },
  ],
};

const CLOUD_ROWS = [
  {
    datasetId: "cloud-1",
    name: "my_dataset",
    status: "ACTIVE",
    schemaType: "AGENTCORE_EVALUATION_PREDEFINED_V1",
    exampleCount: 3,
  },
];

function stubFetch({
  datasets = [LEGACY_DS, SCENARIO_DS],
  onCreate = vi.fn(),
}: { datasets?: unknown[]; onCreate?: ReturnType<typeof vi.fn> } = {}) {
  const fetchFn = vi.fn().mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const json = (body: unknown) => ({ ok: true, json: async () => body });
    if (url.endsWith("/samples/datasets")) return json({ datasets: [SCENARIO_SAMPLE, SIMULATED_SAMPLE] });
    if (url.endsWith("/datasets") && init?.method === "POST") {
      onCreate(JSON.parse(String(init.body)));
      return json({ ...LEGACY_DS, id: "d-new" });
    }
    if (url.endsWith("/datasets")) return json({ datasets });
    if (url.endsWith("/datasets/d-2/sync-to-aws")) return json({ jobId: "j-sync" });
    if (url.includes("/jobs/")) return json({ id: "j-sync", state: "completed", result: { datasetId: "cloud-1" } });
    if (url.endsWith("/datasets/cloud/list")) return json({ datasets: CLOUD_ROWS });
    if (url.includes("/datasets/cloud/") && init?.method === "DELETE") return json({ datasetId: "cloud-1", deleted: true });
    if (url.includes("/datasets/d-")) return json(datasets[0]);
    return json({});
  });
  vi.stubGlobal("fetch", fetchFn);
  return fetchFn;
}

function renderPage() {
  return render(
    <JourneyProvider>
      <ConsoleProvider>
        <DatasetsPage />
      </ConsoleProvider>
    </JourneyProvider>,
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
  // Keep the lab4.lang=en pin from src/test/setup.ts intact.
  localStorage.removeItem("lab4.consoleSection");
});

describe("validateScenarioJson", () => {
  it("rejects non-array, missing ids, missing turns, bad actor profiles", () => {
    expect(() => validateScenarioJson("predefined", "{}")).toThrow(/array/);
    expect(() => validateScenarioJson("predefined", "[]")).toThrow(/array/);
    expect(() => validateScenarioJson("predefined", '[{"turns":[{"input":"x"}]}]')).toThrow(/scenario_id/);
    expect(() => validateScenarioJson("predefined", '[{"scenario_id":"a"}]')).toThrow(/turns/);
    expect(() => validateScenarioJson("simulated", '[{"scenario_id":"a","input":"x"}]')).toThrow(/actor_profile/);
    expect(() =>
      validateScenarioJson("simulated", '[{"scenario_id":"a","actor_profile":{"context":"c","goal":"g"}}]'),
    ).toThrow(/input/);
    expect(
      validateScenarioJson("simulated", '[{"scenario_id":"a","actor_profile":{"context":"c","goal":"g"},"input":"x"}]'),
    ).toHaveLength(1);
  });
});

describe("DatasetsPage scenario support", () => {
  it("shows kind badges and scenario counts on cards", async () => {
    stubFetch();
    renderPage();
    await waitFor(() => expect(screen.getByText("Legacy DS")).toBeInTheDocument());
    expect(screen.getByText("Prompt list")).toBeInTheDocument();
    // Scenario card: badge + "2 scenarios · 3 turns" count.
    expect(screen.getAllByText("Scenario").length).toBeGreaterThan(0);
    expect(screen.getByText(/2 scenarios/)).toBeInTheDocument();
    expect(screen.getByText(/3 turns/)).toBeInTheDocument();
  });

  it("blocks invalid scenario JSON with an inline error and no API call", async () => {
    const onCreate = vi.fn();
    stubFetch({ onCreate });
    renderPage();
    await waitFor(() => expect(screen.getByText("New scenario dataset")).toBeInTheDocument());

    fireEvent.click(screen.getByText("New scenario dataset"));
    const editor = await screen.findByTestId("scenario-json");
    fireEvent.change(editor, { target: { value: '[{"nope": true}]' } });
    fireEvent.click(screen.getByText("Create dataset"));

    expect(await screen.findByText(/Invalid scenarios/)).toBeInTheDocument();
    expect(onCreate).not.toHaveBeenCalled();
  });

  it("creates a scenario dataset seeded from the sample", async () => {
    const onCreate = vi.fn();
    stubFetch({ onCreate });
    renderPage();
    await waitFor(() => expect(screen.getByText("New scenario dataset")).toBeInTheDocument());

    fireEvent.click(screen.getByText("New scenario dataset"));
    await screen.findByTestId("scenario-json");
    fireEvent.click(screen.getByText("Create dataset"));

    await waitFor(() => expect(onCreate).toHaveBeenCalled());
    const body = onCreate.mock.calls[0][0];
    expect(body.kind).toBe("predefined");
    expect(body.scenarios).toEqual(SCENARIO_SAMPLE.items);
  });

  it("creates a simulated dataset from the sample gallery button", async () => {
    const onCreate = vi.fn();
    stubFetch({ onCreate });
    renderPage();
    await waitFor(() =>
      expect(screen.getByText(/HR simulated personas/)).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByText(/HR simulated personas/));
    await waitFor(() => expect(onCreate).toHaveBeenCalled());
    const body = onCreate.mock.calls[0][0];
    expect(body.kind).toBe("simulated");
    expect(body.scenarios).toEqual(SIMULATED_SAMPLE.items);
  });
});

describe("DatasetsPage cloud section", () => {
  it("shows synced cloud info on the dataset card", async () => {
    stubFetch();
    renderPage();
    await waitFor(() => expect(screen.getByText("Scenario DS")).toBeInTheDocument());
    expect(screen.getByText("cloud-1")).toBeInTheDocument();
    expect(screen.getByText("ACTIVE")).toBeInTheDocument();
  });

  it("syncs a dataset to AWS through the job flow", async () => {
    const fetchFn = stubFetch();
    renderPage();
    await waitFor(() => expect(screen.getByText("Scenario DS")).toBeInTheDocument());

    const buttons = screen.getAllByText("Sync to AWS");
    fireEvent.click(buttons[1]); // the scenario card's row
    await waitFor(() =>
      expect(fetchFn.mock.calls.some(([u]) => String(u).includes("/sync-to-aws"))).toBe(true),
    );
  });

  it("lists cloud datasets on refresh and deletes with confirmation", async () => {
    const fetchFn = stubFetch();
    renderPage();
    await waitFor(() => expect(screen.getByText("Refresh from AWS")).toBeInTheDocument());

    fireEvent.click(screen.getByText("Refresh from AWS"));
    await waitFor(() => expect(screen.getByText("my_dataset")).toBeInTheDocument());
    expect(screen.getByText("AGENTCORE_EVALUATION_PREDEFINED_V1")).toBeInTheDocument();

    // Delete requires a confirm click.
    const cloudCardDelete = screen
      .getAllByText("Delete")
      .find((el) => el.closest("li")?.textContent?.includes("my_dataset"));
    expect(cloudCardDelete).toBeTruthy();
    fireEvent.click(cloudCardDelete!);
    expect(
      fetchFn.mock.calls.every(([u, i]) => !(String(u).includes("/datasets/cloud/") && (i as RequestInit)?.method === "DELETE")),
    ).toBe(true);
    fireEvent.click(await screen.findByText("Confirm delete"));
    await waitFor(() =>
      expect(
        fetchFn.mock.calls.some(([u, i]) => String(u).includes("/datasets/cloud/cloud-1") && (i as RequestInit)?.method === "DELETE"),
      ).toBe(true),
    );
  });
});
