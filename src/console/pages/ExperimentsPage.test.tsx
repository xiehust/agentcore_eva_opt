import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { JourneyProvider } from "../../state/journey";
import { ConsoleProvider } from "../../state/console";
import { ExperimentsPage } from "./ExperimentsPage";
import type { ExperimentRecord } from "../../lib/liveApi";

const DEPLOYED = {
  id: "a-1",
  name: "Champ",
  description: "",
  requirements: [],
  config: { systemPrompt: "You are helpful.", toolDescriptions: { t1: "d1" } },
  deployment: {
    status: "deployed",
    runtimeArn: "arn:r1",
    logGroup: "/lg",
    serviceName: "s.DEFAULT",
    roleArn: "arn:role",
  },
  createdAt: 1,
  updatedAt: 1,
};
const CHALLENGER = { ...DEPLOYED, id: "a-2", name: "Challenger" };
const NO_CONFIG = { ...DEPLOYED, id: "a-3", name: "Bare", config: null };
const UNDEPLOYED = { ...DEPLOYED, id: "a-4", name: "Parked", deployment: null };

function makeExp(overrides: Partial<ExperimentRecord> = {}): ExperimentRecord {
  return {
    id: "e-1",
    name: "Exp 1",
    agentId: "a-1",
    agentName: "Champ",
    challengerAgentId: null,
    challengerAgentName: null,
    stage: "recommend",
    artifacts: {},
    error: null,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

function stubFetch({
  agents = [DEPLOYED, CHALLENGER, NO_CONFIG, UNDEPLOYED],
  experiments = [] as ExperimentRecord[],
  experiment = null as ExperimentRecord | null,
} = {}) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fn = vi.fn().mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    const json = (body: unknown) => ({ ok: true, json: async () => body });
    if (url.endsWith("/agents")) return json({ agents });
    if (/\/agents\/a-\d+$/.test(url)) {
      const id = url.split("/").pop();
      return json(agents.find((a) => a.id === id));
    }
    if (url.endsWith("/experiments") && init?.method === "POST") {
      return json(makeExp({ id: "e-new" }));
    }
    if (url.endsWith("/experiments")) return json({ experiments });
    if (/\/experiments\/[\w-]+$/.test(url) && init?.method === "PUT") {
      return json(experiment ?? makeExp());
    }
    if (/\/experiments\/[\w-]+$/.test(url)) return json(experiment ?? makeExp());
    if (url.endsWith("/datasets")) return json({ datasets: [] });
    if (url.includes("/session/")) return { ok: false, status: 404, statusText: "nf", json: async () => ({}) };
    return json({ ok: true });
  });
  return { fn, calls };
}

function renderPage() {
  return render(
    <JourneyProvider>
      <ConsoleProvider>
        <ExperimentsPage />
      </ConsoleProvider>
    </JourneyProvider>,
  );
}

describe("ExperimentsPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.removeItem("lab4.consoleSection");
  });

  it("create form only lists deployed agents", async () => {
    vi.stubGlobal("fetch", stubFetch().fn);
    renderPage();
    const select = (await screen.findAllByRole("combobox"))[0];
    const options = Array.from(select.querySelectorAll("option")).map((o) => o.textContent);
    expect(options).toContain("Champ");
    expect(options).toContain("Bare");
    expect(options).not.toContain("Parked");
  });

  it("warns and blocks create when the picked agent has no config", async () => {
    vi.stubGlobal("fetch", stubFetch({ agents: [NO_CONFIG] }).fn);
    renderPage();
    expect(await screen.findByText(/no config/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /create experiment/i })).toBeDisabled();
  });

  it("creating an experiment opens the detail view", async () => {
    const stub = stubFetch({ experiment: makeExp({ id: "e-new" }) });
    vi.stubGlobal("fetch", stub.fn);
    renderPage();
    await screen.findAllByRole("combobox");
    fireEvent.click(screen.getByRole("button", { name: /create experiment/i }));
    // Detail view shows the recommend stage card.
    expect(await screen.findByText(/1 · AI recommendations/i)).toBeInTheDocument();
    const post = stub.calls.find((c) => c.url.endsWith("/experiments") && c.init?.method === "POST");
    expect(JSON.parse(String(post!.init!.body))).toMatchObject({ agentId: "a-1" });
  });

  it("empty artifacts → only the recommend stage is shown", async () => {
    vi.stubGlobal(
      "fetch",
      stubFetch({ experiments: [makeExp()], experiment: makeExp() }).fn,
    );
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /open/i }));
    expect(await screen.findByText(/1 · AI recommendations/i)).toBeInTheDocument();
    expect(screen.queryByText(/2 · Configuration bundles/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/3 · Gateway/i)).not.toBeInTheDocument();
  });

  it("abtest stage with bundleAbTestId shows traffic + skips setup button", async () => {
    const exp = makeExp({
      stage: "abtest",
      artifacts: {
        acceptedSystemPrompt: "v2 prompt",
        controlBundleId: "b-c",
        controlBundleVersion: "ver-1",
        treatmentBundleId: "b-t",
        treatmentBundleVersion: "ver-1",
        gatewayId: "gw-1",
        gatewayArn: "arn:gw",
        roleArn: "arn:role",
        targetNameV1: "t1champ",
        bundleAbTestId: "ab-1",
      },
    });
    vi.stubGlobal("fetch", stubFetch({ experiments: [exp], experiment: exp }).fn);
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /open/i }));
    await screen.findByText(/3 · Gateway/i);
    // Setup already done → id line rendered (header + stage line), no setup button.
    expect(screen.getAllByText(/ab-1/).length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: /create gateway/i })).not.toBeInTheDocument();
    // Traffic section present (heading + button).
    expect(screen.getAllByText(/send traffic/i).length).toBeGreaterThan(0);
  });

  it("promoted stage shows canary with challenger picker excluding champion", async () => {
    const exp = makeExp({
      stage: "promoted",
      artifacts: {
        controlBundleId: "b-c",
        bundleAbTestId: "ab-1",
        gatewayId: "gw-1",
        bundleMetrics: [],
        promotedVersionId: "ver-2",
      },
    });
    vi.stubGlobal("fetch", stubFetch({ experiments: [exp], experiment: exp }).fn);
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /open/i }));
    await screen.findByText(/4 · Target-routing canary/i);
    await waitFor(() => {
      const selects = screen.getAllByRole("combobox");
      const challengerSelect = selects[selects.length - 1];
      const options = Array.from(challengerSelect.querySelectorAll("option")).map(
        (o) => o.textContent,
      );
      expect(options).toContain("Challenger");
      expect(options).not.toContain("Champ");
    });
  });
});
