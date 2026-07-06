import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { JourneyProvider } from "../../state/journey";
import { ConsoleProvider } from "../../state/console";
import { AgentsPage } from "./AgentsPage";

const SAMPLE = {
  name: "HR Assistant (sample)",
  description: "sample agent",
  code: "print('hr')",
  requirements: [],
};

function makeFetchStub(agents: unknown[]) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fn = vi.fn().mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    const json = (body: unknown) => ({ ok: true, json: async () => body });
    if (url.includes("/samples/agent")) return json(SAMPLE);
    if (url.endsWith("/agents") && init?.method === "POST") {
      return json({ id: "a-1", ...SAMPLE, deployment: null, createdAt: 1, updatedAt: 1 });
    }
    if (url.endsWith("/agents/a-1")) {
      return json({ id: "a-1", ...SAMPLE, deployment: null, createdAt: 1, updatedAt: 1 });
    }
    if (url.endsWith("/agents")) return json({ agents });
    if (url.includes("/session/")) return { ok: false, status: 404, statusText: "nf", json: async () => ({}) };
    return json({ ok: true });
  });
  return { fn, calls };
}

function renderPage() {
  return render(
    <JourneyProvider>
      <ConsoleProvider>
        <AgentsPage />
      </ConsoleProvider>
    </JourneyProvider>,
  );
}

describe("AgentsPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.removeItem("lab4.consoleSection");
  });

  it("shows the empty hint when there are no agents", async () => {
    vi.stubGlobal("fetch", makeFetchStub([]).fn);
    renderPage();
    expect(await screen.findByText(/no agents yet/i)).toBeInTheDocument();
  });

  it("clones the HR sample into a new agent and opens the editor", async () => {
    const stub = makeFetchStub([]);
    vi.stubGlobal("fetch", stub.fn);
    renderPage();
    await screen.findByText(/no agents yet/i);
    fireEvent.click(screen.getByRole("button", { name: "New from HR sample" }));
    // The editor opens on the created agent, with its name shown.
    await waitFor(() => {
      expect(screen.getAllByText("HR Assistant (sample)").length).toBeGreaterThan(0);
    });
    // Verify the sample code was cloned via POST /agents.
    const post = stub.calls.find((c) => c.url.endsWith("/agents") && c.init?.method === "POST");
    expect(post).toBeDefined();
    expect(JSON.parse(String(post!.init!.body))).toMatchObject({ code: "print('hr')" });
  });

  it("renders deployment status badges from the list", async () => {
    vi.stubGlobal(
      "fetch",
      makeFetchStub([
        {
          id: "a-2",
          name: "Deployed Agent",
          description: "",
          requirements: [],
          deployment: {
            status: "deployed",
            runtimeArn: "arn:aws:bedrock-agentcore:::runtime/r-7",
            serviceName: "X.DEFAULT",
            region: "us-west-2",
          },
          createdAt: 1,
          updatedAt: 1,
        },
        {
          id: "a-3",
          name: "Fresh Agent",
          description: "",
          requirements: [],
          deployment: null,
          createdAt: 1,
          updatedAt: 1,
        },
      ]).fn,
    );
    renderPage();
    expect(await screen.findByText("Deployed Agent")).toBeInTheDocument();
    expect(screen.getByText(/^deployed$/i)).toBeInTheDocument();
    expect(screen.getByText(/not deployed/i)).toBeInTheDocument();
    expect(screen.getByText(/runtime\/r-7/)).toBeInTheDocument();
  });
});
