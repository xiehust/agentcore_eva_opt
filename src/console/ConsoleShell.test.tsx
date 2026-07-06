import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import App from "../App";

/** fetch stub: empty console resources, failing identity/session (offline-ish). */
function stubFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      const json = (body: unknown) => ({ ok: true, json: async () => body });
      if (url.includes("/agents")) return json({ agents: [] });
      if (url.includes("/datasets")) return json({ datasets: [] });
      if (url.includes("/runs")) return json({ runs: [] });
      if (url.includes("/evaluators/list")) return json({ evaluators: [] });
      if (url.includes("/session/")) return { ok: false, status: 404, statusText: "Not Found", json: async () => ({}) };
      return json({ ok: true });
    }),
  );
}

describe("ConsoleShell (Live mode)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.removeItem("lab4.consoleSection");
    stubFetch();
  });

  it("sim mode still renders the landing/wizard, not the console", () => {
    render(<App />);
    expect(screen.queryByTestId("console-header")).not.toBeInTheDocument();
    // Landing hero start button present.
    expect(screen.getByRole("button", { name: /start the journey/i })).toBeInTheDocument();
  });

  it("opening the Live console from the landing renders the console shell", async () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /open live console/i }));
    expect(await screen.findByTestId("console-header")).toBeInTheDocument();
    const nav = screen.getByRole("navigation", { name: /console sections/i });
    expect(within(nav).getByText("Agents")).toBeInTheDocument();
    expect(within(nav).getByText("Datasets")).toBeInTheDocument();
    expect(within(nav).getByText("Evaluators")).toBeInTheDocument();
    expect(within(nav).getByText("Runs")).toBeInTheDocument();
    // No wizard stepper in live mode.
    expect(screen.queryByRole("navigation", { name: /optimization journey steps/i })).not.toBeInTheDocument();
  });

  it("switching back to Simulation restores the wizard", async () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /open live console/i }));
    await screen.findByTestId("console-header");
    fireEvent.click(screen.getByRole("button", { name: /simulation/i }));
    expect(screen.queryByTestId("console-header")).not.toBeInTheDocument();
  });

  it("navigates between console sections", async () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /open live console/i }));
    await screen.findByTestId("console-header");
    const nav = screen.getByRole("navigation", { name: /console sections/i });
    fireEvent.click(within(nav).getByText("Datasets"));
    expect(await screen.findByText(/no datasets yet/i)).toBeInTheDocument();
    fireEvent.click(within(nav).getByText("Runs"));
    expect(await screen.findByText(/no runs yet/i)).toBeInTheDocument();
  });
});
