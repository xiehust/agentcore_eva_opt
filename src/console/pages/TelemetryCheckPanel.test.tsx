import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { JourneyProvider } from "../../state/journey";
import { ConsoleProvider } from "../../state/console";
import { TelemetryCheckPanel, OtelSnippet } from "./TelemetryCheckPanel";
import type { TelemetryCheckResult } from "../../lib/liveApi";

const OK_RESULT: TelemetryCheckResult = {
  ok: true,
  serviceName: "ext-svc",
  logGroup: { name: "/ext/lg", exists: true },
  spans: {
    spanCount: 4,
    lastSpanAt: 1700000000000,
    sessionIdPresent: true,
    sessionIdSamples: ["sess-1"],
    operationNames: ["chat", "invoke_agent"],
  },
  hints: [],
};

const NO_SPANS: TelemetryCheckResult = {
  ...OK_RESULT,
  ok: false,
  spans: { ...OK_RESULT.spans, spanCount: 0, sessionIdPresent: false, sessionIdSamples: [], operationNames: [] },
  hints: ["No spans found for service.name=ext-svc in aws/spans over the last 24h."],
};

const NO_SESSION_ID: TelemetryCheckResult = {
  ...OK_RESULT,
  ok: false,
  spans: { ...OK_RESULT.spans, sessionIdPresent: false, sessionIdSamples: [] },
  hints: ['Spans found but none carry session.id — set it via OTEL baggage: baggage.set_baggage("session.id", ...).'],
};

function stubFetch(result: TelemetryCheckResult) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const json = (body: unknown) => ({ ok: true, json: async () => body });
      if (url.includes("/telemetry-check")) return json({ jobId: "j-1" });
      if (url.includes("/jobs/")) return json({ id: "j-1", state: "completed", result });
      if (url.includes("/session/")) return { ok: false, status: 404, statusText: "nf", json: async () => ({}) };
      return json({ ok: true, init });
    }),
  );
}

function renderPanel() {
  return render(
    <JourneyProvider>
      <ConsoleProvider>
        <TelemetryCheckPanel agentId="a-1" />
      </ConsoleProvider>
    </JourneyProvider>,
  );
}

describe("TelemetryCheckPanel", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.removeItem("lab4.consoleSection");
  });

  it("renders the all-green result", async () => {
    stubFetch(OK_RESULT);
    renderPanel();
    fireEvent.click(screen.getByTestId("telemetry-check"));
    const panel = await screen.findByTestId("telemetry-result");
    expect(panel).toHaveTextContent(/telemetry looks good/i);
    expect(screen.getAllByTestId("telemetry-row-ok")).toHaveLength(3);
    expect(panel).toHaveTextContent("4 spans found");
    expect(panel).toHaveTextContent("invoke_agent");
  });

  it("renders the zero-spans failure with its hint", async () => {
    stubFetch(NO_SPANS);
    renderPanel();
    fireEvent.click(screen.getByTestId("telemetry-check"));
    const panel = await screen.findByTestId("telemetry-result");
    expect(panel).toHaveTextContent(/no spans found/i);
    expect(screen.getAllByTestId("telemetry-row-fail")).toHaveLength(2);
    expect(panel).toHaveTextContent(/service\.name=ext-svc/);
    expect(panel).not.toHaveTextContent(/telemetry looks good/i);
  });

  it("renders the missing-session-id state with the baggage hint", async () => {
    stubFetch(NO_SESSION_ID);
    renderPanel();
    fireEvent.click(screen.getByTestId("telemetry-check"));
    const panel = await screen.findByTestId("telemetry-result");
    expect(panel).toHaveTextContent(/evaluations cannot group sessions/i);
    expect(panel).toHaveTextContent(/baggage/);
  });

  it("surfaces a failed probe job as an error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
        const url = String(input);
        const json = (body: unknown) => ({ ok: true, json: async () => body });
        if (url.includes("/telemetry-check")) return json({ jobId: "j-1" });
        if (url.includes("/jobs/")) return json({ id: "j-1", state: "failed", error: "AccessDenied: boom" });
        if (url.includes("/session/")) return { ok: false, status: 404, statusText: "nf", json: async () => ({}) };
        return json({ ok: true });
      }),
    );
    renderPanel();
    fireEvent.click(screen.getByTestId("telemetry-check"));
    expect(await screen.findByRole("alert")).toHaveTextContent(/AccessDenied/);
  });
});

describe("OtelSnippet", () => {
  it("interpolates the binding and copies to the clipboard", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
    render(
      <JourneyProvider>
        <ConsoleProvider>
          <OtelSnippet serviceName="my-agent" logGroup="/my/lg" />
        </ConsoleProvider>
      </JourneyProvider>,
    );
    const snippet = screen.getByTestId("otel-snippet");
    expect(snippet).toHaveTextContent("service.name=my-agent");
    expect(snippet).toHaveTextContent("x-aws-log-group=/my/lg");
    expect(snippet).toHaveTextContent('baggage.set_baggage("session.id", session_id)');
    fireEvent.click(screen.getByTestId("otel-snippet-copy"));
    await waitFor(() => expect(writeText).toHaveBeenCalledOnce());
    expect(writeText.mock.calls[0][0]).toContain("service.name=my-agent");
  });
});
