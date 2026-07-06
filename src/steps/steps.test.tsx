import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, act, within } from "@testing-library/react";
import { JourneyProvider } from "../state/journey";
import { Step9Cleanup } from "./Step9Cleanup";
import { CLEANUP_ITEMS } from "../sim/engine";
import { ROUTING_COMPARISON, JOURNEY_SUMMARY } from "../data/routingComparison";

describe("data: routing + summary", () => {
  it("routing comparison has all dimensions", () => {
    expect(ROUTING_COMPARISON.length).toBeGreaterThanOrEqual(5);
    expect(ROUTING_COMPARISON.map((r) => r.dimension)).toContain("Runtimes needed");
  });

  it("journey summary covers steps 2 through 9 (incl. the insights triage)", () => {
    expect(JOURNEY_SUMMARY.map((r) => r.step)).toEqual(
      expect.arrayContaining(["2", "3", "4", "5", "6a", "6b", "7", "8", "9"]),
    );
  });
});

describe("Step9Cleanup", () => {
  it("renders all cleanup categories and deletes them on run", async () => {
    render(
      <JourneyProvider>
        <Step9Cleanup />
      </JourneyProvider>,
    );

    const list = screen.getByTestId("cleanup-list");
    expect(within(list).getAllByRole("listitem")).toHaveLength(
      CLEANUP_ITEMS.length,
    );
    expect(CLEANUP_ITEMS.length).toBeGreaterThanOrEqual(7);

    // Run cleanup with fake timers so the staggered teardown completes fast.
    vi.useFakeTimers();
    try {
      fireEvent.click(screen.getByRole("button", { name: /run cleanup/i }));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(CLEANUP_ITEMS.length * 600 + 1000);
      });
    } finally {
      vi.useRealTimers();
    }

    // Every item should now show the deleted check mark.
    const checks = within(list)
      .getAllByRole("listitem")
      .filter((li) => li.textContent?.includes("✓"));
    expect(checks).toHaveLength(CLEANUP_ITEMS.length);
    // The closing summary appears once cleanup is done.
    expect(screen.getByText(/journey complete/i)).toBeInTheDocument();
  });
});
