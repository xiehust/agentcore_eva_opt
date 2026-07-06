import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { JourneyProvider } from "../state/journey";
import { StepShell } from "./StepShell";

function renderShell() {
  return render(
    <JourneyProvider>
      <StepShell />
    </JourneyProvider>,
  );
}

describe("Live mode infrastructure", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("defaults to simulation (no live banner, no credentials panel)", () => {
    renderShell();
    expect(screen.queryByText(/real AWS resources/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/AWS credentials/i)).not.toBeInTheDocument();
    // simulation badge present in header
    expect(screen.getByTestId("shell-header").textContent).toMatch(/simulation/i);
  });

  it("switching to Live shows the banner and credentials panel", () => {
    renderShell();
    fireEvent.click(screen.getByRole("button", { name: /live aws/i }));
    // The banner (role=status) carries the cost warning.
    expect(screen.getByRole("status").textContent).toMatch(/real AWS resources/i);
    expect(screen.getByText(/AWS credentials/i)).toBeInTheDocument();
    expect(screen.getByTestId("shell-header").textContent).toMatch(/live/i);
  });

  it("credentials panel 'Test connection' renders the account on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          ok: true,
          account: "434444145045",
          arn: "arn:aws:sts::434444145045:assumed-role/admin_role/i-1",
          region: "us-west-2",
        }),
      }),
    );
    renderShell();
    fireEvent.click(screen.getByRole("button", { name: /live aws/i }));
    fireEvent.click(screen.getByRole("button", { name: /configure credentials/i }));
    fireEvent.click(screen.getByRole("button", { name: /test connection/i }));
    await waitFor(() =>
      expect(screen.getByText(/434444145045 · us-west-2/)).toBeInTheDocument(),
    );
  });

  it("credentials panel shows a readable error when the backend is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    renderShell();
    fireEvent.click(screen.getByRole("button", { name: /live aws/i }));
    fireEvent.click(screen.getByRole("button", { name: /configure credentials/i }));
    fireEvent.click(screen.getByRole("button", { name: /test connection/i }));
    await waitFor(() =>
      expect(screen.getByText(/cannot reach backend/i)).toBeInTheDocument(),
    );
  });
});
