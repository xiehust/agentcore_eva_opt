import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import {
  JourneyProvider,
  journeyReducer,
  initialState,
  type JourneyState,
} from "../state/journey";
import { Step2Deploy } from "./Step2Deploy";
import { Step3Baseline } from "./Step3Baseline";
import { Step4Eval } from "./Step4Eval";
import { Step5Recommend } from "./Step5Recommend";

/**
 * Live-wiring tests: in live mode each step calls the backend (fetch mocked)
 * and renders the REAL returned data; sim mode is exercised by the pre-existing
 * suites. We drive state via a controlled provider seeded to live mode.
 */

function liveProvider(children: React.ReactNode, seed?: Partial<JourneyState>) {
  // A tiny provider that seeds live mode + artifacts by replaying actions.
  function Seeded() {
    return <>{children}</>;
  }
  // Use the real provider but flip to live + set artifacts through a wrapper.
  return (
    <JourneyProvider>
      <SeedLive seed={seed}>
        <Seeded />
      </SeedLive>
    </JourneyProvider>
  );
}

import { useJourney } from "../state/journey";
import { useEffect, useState } from "react";

function SeedLive({
  seed,
  children,
}: {
  seed?: Partial<JourneyState>;
  children: React.ReactNode;
}) {
  const { dispatch } = useJourney();
  const [ready, setReady] = useState(false);
  useEffect(() => {
    dispatch({ type: "SET_MODE", mode: "live" });
    if (seed?.artifacts) dispatch({ type: "SET_ARTIFACT", artifacts: seed.artifacts });
    setReady(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Mount children only after seeding so their useState initializers see the
  // seeded artifacts (mirrors the real app, where persisted state hydrates
  // before a step is opened).
  return ready ? <>{children}</> : null;
}

function mockFetchJson(map: Record<string, unknown>) {
  return vi.fn().mockImplementation(async (url: string) => {
    const key = Object.keys(map).find((k) => url.includes(k));
    return {
      ok: true,
      json: async () => (key ? map[key] : {}),
    };
  });
}

describe("Live wiring — Step 2 deploy", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("calls /api/deploy and renders the real runtime ARN + log group", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetchJson({
        "/api/deploy": { jobId: "job-d" },
        "/api/jobs/job-d": {
          id: "job-d",
          state: "completed",
          result: {
            runtime_arn: "arn:aws:bedrock-agentcore:us-west-2:434444145045:runtime/hrlive",
            runtime_id: "hrlive",
            log_group: "/aws/bedrock-agentcore/runtimes/hrlive",
            service_name: "HRAssistV1live",
          },
        },
      }),
    );

    render(liveProvider(<Step2Deploy />, { artifacts: { v1Name: "HRAssistV1live" } }));
    await act(async () => {
      fireEvent.click(await screen.findByRole("button", { name: /deploy hr assistant v1 \(real\)/i }));
    });
    await waitFor(() =>
      expect(
        screen.getByText(/arn:aws:bedrock-agentcore:us-west-2:434444145045:runtime\/hrlive/),
      ).toBeInTheDocument(),
    );
    expect(
      screen.getByText("/aws/bedrock-agentcore/runtimes/hrlive"),
    ).toBeInTheDocument();
  });
});

describe("Live wiring — Step 3 baseline traffic", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("fills the session log from the traffic job and persists it", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetchJson({
        "/api/traffic": { jobId: "job-t" },
        "/api/jobs/job-t": {
          id: "job-t",
          state: "completed",
          result: {
            sessionIds: [
              "08725a36-18e2-4a66-b023-62466e3d6bbc",
              "e89f8b6b-8862-4b6f-90fc-a9bb8fa84dc1",
            ],
            count: 2,
          },
        },
      }),
    );
    render(
      liveProvider(<Step3Baseline />, {
        artifacts: {
          agentArn: "arn:v1",
          baselineBundleId: "bndl-1",
          baselineBundleVersion: "ver-1",
        },
      }),
    );
    await act(async () => {
      fireEvent.click(
        await screen.findByRole("button", { name: /send 10 sessions \(real\)/i }),
      );
    });
    // The log shows the real (shortened) session ids returned by the backend.
    await waitFor(() => expect(screen.getByText("08725a36")).toBeInTheDocument());
    expect(screen.getByText("e89f8b6b")).toBeInTheDocument();
  });

  it("rehydrates the session log from persisted artifacts on remount", () => {
    render(
      liveProvider(<Step3Baseline />, {
        artifacts: {
          baselineBundleId: "bndl-1",
          baselineBundleVersion: "ver-1",
          baselineSessionIds: "08725a36,e89f8b6b",
        },
      }),
    );
    expect(screen.getByText("08725a36")).toBeInTheDocument();
    expect(screen.getByText("e89f8b6b")).toBeInTheDocument();
  });
});

describe("Live wiring — Step 4 eval", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("renders scores from the /api/evaluate job (not the static sim values)", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetchJson({
        "/api/evaluate": { jobId: "job-e" },
        "/api/jobs/job-e": {
          id: "job-e",
          state: "completed",
          result: {
            batchEvaluationId: "be-live",
            status: "COMPLETED",
            scores: [
              { evaluatorId: "Builtin.GoalSuccessRate", score: 0.66 },
              { evaluatorId: "Builtin.Helpfulness", score: 0.7 },
              { evaluatorId: "Builtin.Correctness", score: 0.69 },
            ],
          },
        },
      }),
    );
    render(liveProvider(<Step4Eval />, { artifacts: { serviceName: "svc", logGroup: "lg" } }));
    await act(async () => {
      fireEvent.click(
        await screen.findByRole("button", { name: /start batch evaluation \(real\)/i }),
      );
    });
    // 0.66 is a live value distinct from the sim baseline (0.72).
    await waitFor(() => expect(screen.getByText("0.66")).toBeInTheDocument());
  });

  it("sends selected extra + custom evaluators through /api/evaluators + /api/evaluate", async () => {
    const fetchMock = mockFetchJson({
      "/api/evaluators": { evaluatorId: "custom-ev-1", status: "CREATING" },
      "/api/evaluate": { jobId: "job-e" },
      "/api/jobs/job-e": {
        id: "job-e",
        state: "completed",
        result: {
          batchEvaluationId: "be-live",
          status: "COMPLETED",
          scores: [
            { evaluatorId: "Builtin.GoalSuccessRate", score: 0.66 },
            { evaluatorId: "Builtin.Faithfulness", score: 0.8 },
            { evaluatorId: "custom-ev-1", score: 0.55 },
          ],
        },
      },
    });
    vi.stubGlobal("fetch", fetchMock);
    render(liveProvider(<Step4Eval />, { artifacts: { serviceName: "svc", logGroup: "lg" } }));

    // Tick an optional built-in + the custom sample.
    fireEvent.click(await screen.findByRole("checkbox", { name: /faithfulness/i }));
    fireEvent.click(screen.getByRole("checkbox", { name: /hrpolicycompliance/i }));
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: /start batch evaluation \(real\)/i }),
      );
    });
    await waitFor(() => expect(screen.getByText("0.55")).toBeInTheDocument());

    // CreateEvaluator was called with the sample LLM-judge payload.
    const createCall = fetchMock.mock.calls.find(
      ([url, init]) => String(url).includes("/api/evaluators") && init?.method === "POST",
    );
    expect(createCall).toBeDefined();
    const createBody = JSON.parse(createCall![1].body as string);
    expect(createBody.name).toMatch(/^HRPolicyCompliance/);
    expect(createBody.instructions).toContain("{assistant_turn}");
    expect(createBody.ratingScale.length).toBeGreaterThanOrEqual(2);

    // The batch evaluation carries defaults + the extra + the created custom id.
    // (endsWith: "/api/evaluators" contains "/api/evaluate" as a substring.)
    const evalCall = fetchMock.mock.calls.find(([url]) =>
      String(url).endsWith("/api/evaluate"),
    );
    const evalBody = JSON.parse(evalCall![1].body as string);
    expect(evalBody.evaluators).toContain("Builtin.GoalSuccessRate");
    expect(evalBody.evaluators).toContain("Builtin.Faithfulness");
    expect(evalBody.evaluators).toContain("custom-ev-1");
  });
});

describe("Live wiring — Step 5 recommend", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("renders the diff from the real recommendation response", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetchJson({
        "/api/recommend/system-prompt": { jobId: "job-r" },
        "/api/jobs/job-r": {
          id: "job-r",
          state: "completed",
          result: {
            recommendedSystemPrompt: "LIVE RECOMMENDED PROMPT — distinct text",
          },
        },
      }),
    );
    render(liveProvider(<Step5Recommend />, { artifacts: { serviceName: "svc", logGroup: "lg" } }));
    await act(async () => {
      fireEvent.click(
        await screen.findByRole("button", {
          name: /generate system-prompt recommendation \(real\)/i,
        }),
      );
    });
    await waitFor(() =>
      expect(screen.getByText(/LIVE RECOMMENDED PROMPT/)).toBeInTheDocument(),
    );
  });

  it("renders a readable error + retry when the backend 500s", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "err",
        json: async () => ({ detail: "backend exploded" }),
      }),
    );
    render(liveProvider(<Step5Recommend />, { artifacts: { serviceName: "svc", logGroup: "lg" } }));
    await act(async () => {
      fireEvent.click(
        await screen.findByRole("button", {
          name: /generate system-prompt recommendation \(real\)/i,
        }),
      );
    });
    await waitFor(() =>
      expect(screen.getByText(/backend exploded/)).toBeInTheDocument(),
    );
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });
});

// A sanity check that the sim path is unaffected: the reducer still starts in sim.
describe("sim intact", () => {
  it("initial state is sim mode", () => {
    expect(initialState().mode).toBe("sim");
    const s = journeyReducer(initialState(), { type: "START_JOURNEY" });
    expect(s.mode).toBe("sim");
  });
});
