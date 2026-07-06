import { lazy, Suspense } from "react";
import type { ABMetric } from "../sim/types";

// Recharts is heavy; load it only when an A/B chart is actually shown
// (Steps 7 & 8), keeping it out of the initial bundle.
const ABComparisonChart = lazy(() =>
  import("./ABComparisonChart").then((m) => ({ default: m.ABComparisonChart })),
);

interface Props {
  metrics: ABMetric[];
  controlLabel?: string;
  treatmentLabel?: string;
}

/** Suspense wrapper around the Recharts-based comparison chart. */
export function LazyABChart(props: Props) {
  return (
    <Suspense
      fallback={
        <div className="flex h-56 items-center justify-center rounded-md border border-line bg-ink-900/40">
          <span className="font-mono text-xs text-fog-500">Loading chart…</span>
        </div>
      }
    >
      <ABComparisonChart {...props} />
    </Suspense>
  );
}
