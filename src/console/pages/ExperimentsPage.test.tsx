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
    kind: "config_bundle",
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
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      return json(makeExp({ id: "e-new", kind: body.kind ?? "config_bundle" }));
    }
    if (url.endsWith("/experiments")) return json({ experiments });
    if (/\/experiments\/[\w-]+$/.test(url) && init?.method === "PUT") {
      return json(experiment ?? makeExp());
    }
    if (/\/experiments\/[\w-]+$/.test(url)) return json(experiment ?? makeExp());
    if (url.endsWith("/datasets")) return json({ datasets: [] });
    // Job-backed setup steps for the target-based standalone flow.
    if (url.endsWith("/gateway/setup") && init?.method === "POST") return json({ jobId: "gwjob" });
    if (url.endsWith("/abtest/target-setup") && init?.method === "POST") return json({ jobId: "tjob" });
    if (url.endsWith("/abtest/config-bundle") && init?.method === "POST") return json({ abTestId: "cfg-ab" });
    if (url.endsWith("/jobs/gwjob")) {
      return json({
        id: "gwjob",
        state: "completed",
        result: {
          gatewayId: "gw-x",
          gatewayArn: "arn:gw",
          targetId: "tv1",
          onlineEvalArn: "arn:oe1",
          onlineEvalId: "oe1",
          roleArn: "arn:role",
        },
      });
    }
    if (url.endsWith("/jobs/tjob")) {
      return json({
        id: "tjob",
        state: "completed",
        result: {
          targetIdV2: "tv2",
          onlineEvalArnV2: "arn:oe2",
          onlineEvalIdV2: "oe2",
          abTestId: "target-ab-x",
        },
      });
    }
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

  it("create form offers a kind selector and passes the chosen kind to createExperiment", async () => {
    const stub = stubFetch({ experiment: makeExp({ id: "e-new", kind: "target_based" }) });
    vi.stubGlobal("fetch", stub.fn);
    renderPage();
    await screen.findAllByRole("combobox");
    // Exactly the two kinds are offered.
    expect(screen.getByText("Config-bundle A/B")).toBeInTheDocument();
    expect(screen.getByText("Target-based A/B")).toBeInTheDocument();
    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(2);
    // Pick target-based, create, and assert the kind reaches the POST body.
    fireEvent.click(radios[1]);
    fireEvent.click(screen.getByRole("button", { name: /create experiment/i }));
    await waitFor(() => {
      const post = stub.calls.find(
        (c) => c.url.endsWith("/experiments") && c.init?.method === "POST",
      );
      expect(post).toBeTruthy();
      expect(JSON.parse(String(post!.init!.body))).toMatchObject({
        agentId: "a-1",
        kind: "target_based",
      });
    });
  });

  it("config_bundle detail renders promote + finish and NO target-based/canary stage", async () => {
    const exp = makeExp({
      kind: "config_bundle",
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
    // Config-bundle stages present.
    await screen.findByText(/3 · Gateway/i);
    expect(screen.getByText(/Experiment complete/i)).toBeInTheDocument();
    // No target-based / canary stage for a config-bundle experiment.
    expect(screen.queryByText(/Target-based A\/B \(standalone\)/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Target-routing canary/i)).not.toBeInTheDocument();
  });

  it("target_based detail renders the standalone flow (challenger picker, no recommend/bundles)", async () => {
    const exp = makeExp({ kind: "target_based", stage: "recommend", artifacts: {} });
    vi.stubGlobal("fetch", stubFetch({ experiments: [exp], experiment: exp }).fn);
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /open/i }));
    await screen.findByText(/Target-based A\/B \(standalone\)/i);
    // Standalone target flow does NOT reuse the config-bundle recommend/bundles stages.
    expect(screen.queryByText(/1 · AI recommendations/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/2 · Configuration bundles/i)).not.toBeInTheDocument();
    // Challenger picker excludes the champion.
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

  it("target_based detail shows the 80/20 split and its A/B info once set up", async () => {
    const exp = makeExp({
      kind: "target_based",
      stage: "monitor",
      challengerAgentId: "a-2",
      challengerAgentName: "Challenger",
      artifacts: {
        gatewayId: "gw-x",
        gatewayArn: "arn:gw",
        roleArn: "arn:role",
        targetNameV1: "tv1",
        targetNameV2: "tv2",
        onlineEvalArnV1: "arn:oe1",
        targetAbTestId: "target-ab-x",
        weights: { control: 80, treatment: 20 },
      },
    });
    const stub = stubFetch({ experiments: [exp], experiment: exp });
    vi.stubGlobal("fetch", stub.fn);
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /open/i }));
    await screen.findByText(/Target-based A\/B \(standalone\)/i);
    // 80/20 shown in displayed copy.
    expect(screen.getByText(/80 \/ 20/)).toBeInTheDocument();
    // A standalone target-based experiment never issues a config-bundle A/B call.
    expect(
      stub.calls.some((c) => c.url.endsWith("/abtest/config-bundle")),
    ).toBe(false);
  });

  it("target_based setup calls abtest/target-setup WITHOUT bundleAbTestId and never config-bundle", async () => {
    const exp = makeExp({
      kind: "target_based",
      stage: "recommend",
      challengerAgentId: "a-2",
      challengerAgentName: "Challenger",
      artifacts: {},
    });
    const stub = stubFetch({ experiments: [exp], experiment: exp });
    vi.stubGlobal("fetch", stub.fn);
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /open/i }));
    // Setup button appears because the challenger is already chosen.
    const setupBtn = await screen.findByRole("button", { name: /Set up gateway/i });
    fireEvent.click(setupBtn);
    await waitFor(() => {
      const ts = stub.calls.find(
        (c) => c.url.endsWith("/abtest/target-setup") && c.init?.method === "POST",
      );
      expect(ts).toBeTruthy();
      const body = JSON.parse(String(ts!.init!.body));
      // Standalone: no config-bundle test to stop.
      expect(body.bundleAbTestId).toBeUndefined();
      expect("bundleAbTestId" in body).toBe(false);
    });
    // Gateway setup ran; config-bundle A/B never called.
    expect(stub.calls.some((c) => c.url.endsWith("/gateway/setup"))).toBe(true);
    expect(stub.calls.some((c) => c.url.endsWith("/abtest/config-bundle"))).toBe(false);
  });
});
