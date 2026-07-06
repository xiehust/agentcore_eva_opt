import { describe, it, expect } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { JourneyProvider } from "../state/journey";
import { StepShell } from "./StepShell";

function renderShell() {
  return render(
    <JourneyProvider>
      <StepShell />
    </JourneyProvider>,
  );
}

describe("StepShell", () => {
  it("renders a 9-item stepper", () => {
    renderShell();
    const nav = screen.getByRole("navigation", {
      name: /optimization journey steps/i,
    });
    const items = within(nav).getAllByRole("listitem");
    expect(items).toHaveLength(9);
  });

  it("locks steps after the first", () => {
    renderShell();
    // Step 1 is reachable; a later step is disabled (locked).
    expect(
      screen.getByRole("button", { name: /step 1: configuration/i }),
    ).toBeEnabled();
    expect(
      screen.getByRole("button", { name: /step 9: cleanup \(locked\)/i }),
    ).toBeDisabled();
  });

  it("toggles the code view panel and shows a python snippet", () => {
    renderShell();
    expect(screen.queryByTestId("code-view-panel")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /show code view/i }));
    const panel = screen.getByTestId("code-view-panel");
    expect(panel).toBeInTheDocument();
    // The config step's snippet references the SUFFIX naming.
    expect(within(panel).getByText(/python/i)).toBeInTheDocument();
    expect(panel.textContent).toContain("SUFFIX");
  });

  it("shows account + region + simulation badge in the header", () => {
    renderShell();
    const header = screen.getByTestId("shell-header");
    expect(within(header).getByText(/acct 123456789012/i)).toBeInTheDocument();
    expect(within(header).getByText(/us-west-2/i)).toBeInTheDocument();
    // The lowercase "simulation" status badge (distinct from the "Simulation"
    // mode-toggle button) confirms sim mode is the default.
    expect(within(header).getByText("simulation")).toBeInTheDocument();
  });
});
