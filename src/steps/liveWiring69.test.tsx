import { describe, it, expect, vi, beforeEach } from "vitest";
import { useEffect } from "react";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { JourneyProvider, useJourney, type JourneyState } from "../state/journey";
import { Step6Bundles } from "./Step6Bundles";
import { Step9Cleanup } from "./Step9Cleanup";

function SeedLive({
  seed,
  children,
}: {
  seed?: Partial<JourneyState>;
  children: React.ReactNode;
}) {
  const { dispatch } = useJourney();
  useEffect(() => {
    dispatch({ type: "SET_MODE", mode: "live" });
    if (seed?.artifacts) dispatch({ type: "SET_ARTIFACT", artifacts: seed.artifacts });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <>{children}</>;
}

function renderLive(node: React.ReactNode, seed?: Partial<JourneyState>) {
  return render(
    <JourneyProvider>
      <SeedLive seed={seed}>{node}</SeedLive>
    </JourneyProvider>,
  );
}

function mockFetchJson(map: Record<string, unknown>) {
  return vi.fn().mockImplementation(async (url: string) => {
    const key = Object.keys(map).find((k) => url.includes(k));
    return { ok: true, json: async () => (key ? map[key] : {}) };
  });
}

describe("Live wiring — Step 6 bundles", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("creates a real bundle via /api/bundles and shows the returned id/version", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetchJson({
        "/api/bundles": {
          bundleId: "bndl-LIVE123",
          versionId: "ver-LIVE999",
          bundleArn: "arn:aws:bundle",
        },
      }),
    );
    renderLive(<Step6Bundles />, { artifacts: { agentArn: "arn:aws:agent", suffix: "abc" } });
    await act(async () => {
      fireEvent.click(await screen.findByRole("button", { name: /create control bundle/i }));
    });
    await waitFor(() => expect(screen.getByText("bndl-LIVE123")).toBeInTheDocument());
    expect(screen.getByText("ver-LIVE999")).toBeInTheDocument();
  });
});

describe("Live wiring — Step 9 cleanup", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("calls /api/cleanup and renders per-category deleted results", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetchJson({
        "/api/cleanup": {
          results: [
            { category: "bundle:b1", status: "deleted", detail: "" },
            { category: "gateway", status: "deleted", detail: "" },
          ],
          deleted: 2,
          total: 2,
        },
      }),
    );
    renderLive(<Step9Cleanup />, { artifacts: { baselineBundleId: "b1", gatewayId: "gw1" } });
    await act(async () => {
      fireEvent.click(await screen.findByRole("button", { name: /run cleanup/i }));
    });
    // On success the journey-complete recap appears.
    await waitFor(() =>
      expect(screen.getByText(/journey complete/i)).toBeInTheDocument(),
    );
    // At least one category shows the deleted check.
    const list = screen.getByTestId("cleanup-list");
    expect(list.textContent).toContain("✓");
  });

  it("shows a readable error when cleanup fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "err",
        json: async () => ({ detail: "cleanup failed hard" }),
      }),
    );
    renderLive(<Step9Cleanup />, { artifacts: { baselineBundleId: "b1" } });
    await act(async () => {
      fireEvent.click(await screen.findByRole("button", { name: /run cleanup/i }));
    });
    await waitFor(() =>
      expect(screen.getByText(/cleanup failed hard/)).toBeInTheDocument(),
    );
  });
});
