import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
import { Badge } from "./ui";
import type { ABMetric } from "../sim/types";
import { cn } from "../lib/cn";

interface ABComparisonChartProps {
  metrics: ABMetric[];
  controlLabel?: string;
  treatmentLabel?: string;
}

const CONTROL_COLOR = "#5d6a80"; // fog-600
const TREATMENT_COLOR = "#ff9900"; // aws-orange

/**
 * Grouped bar comparison of control vs treatment mean per evaluator, plus a
 * per-evaluator stat row (percent change, p-value, significance). Reused by
 * both the config-bundle (Step 7) and target-based (Step 8) A/B tests.
 */
export function ABComparisonChart({
  metrics,
  controlLabel = "Control (C)",
  treatmentLabel = "Treatment (T1)",
}: ABComparisonChartProps) {
  const data = metrics.map((m) => ({
    name: m.label,
    control: Number(m.control.mean.toFixed(3)),
    treatment: Number(m.variants[0].mean.toFixed(3)),
  }));

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-4 text-xs">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: CONTROL_COLOR }} />
          <span className="text-fog-400">{controlLabel}</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: TREATMENT_COLOR }} />
          <span className="text-fog-300">{treatmentLabel}</span>
        </span>
      </div>

      <div className="h-56 w-full" data-testid="ab-chart">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 16, right: 8, left: -16, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#243043" vertical={false} />
            <XAxis
              dataKey="name"
              tick={{ fill: "#7d8ca3", fontSize: 12 }}
              axisLine={{ stroke: "#243043" }}
              tickLine={false}
            />
            <YAxis
              domain={[0, 1]}
              tick={{ fill: "#7d8ca3", fontSize: 11 }}
              axisLine={{ stroke: "#243043" }}
              tickLine={false}
            />
            <Bar dataKey="control" fill={CONTROL_COLOR} radius={[3, 3, 0, 0]} maxBarSize={48}>
              <LabelList dataKey="control" position="top" fill="#b8c4d6" fontSize={11} />
            </Bar>
            <Bar dataKey="treatment" fill={TREATMENT_COLOR} radius={[3, 3, 0, 0]} maxBarSize={48}>
              <LabelList dataKey="treatment" position="top" fill="#ffb347" fontSize={11} />
              {data.map((_, i) => (
                <Cell key={i} fill={TREATMENT_COLOR} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Per-evaluator significance rows */}
      <ul className="space-y-2">
        {metrics.map((m) => {
          const v = m.variants[0];
          const up = v.percentChange >= 0;
          return (
            <li
              key={m.evaluatorId}
              className="flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-md border border-line bg-ink-900/40 px-3 py-2 text-xs"
            >
              <span className="min-w-36 font-mono font-medium text-fog-200">
                {m.label}
              </span>
              <span
                className={cn(
                  "font-mono font-semibold",
                  up ? "text-ok" : "text-danger",
                )}
              >
                {up ? "+" : ""}
                {v.percentChange.toFixed(1)}%
              </span>
              <span className="font-mono text-fog-500">
                p = {v.pValue.toFixed(3)}
              </span>
              <span className="font-mono text-fog-500">
                n = {m.control.sampleSize}/{v.sampleSize}
              </span>
              <Badge
                variant={v.isSignificant ? "ok" : "warn"}
                dot
                className="ml-auto"
              >
                {v.isSignificant ? "significant" : "not significant"}
              </Badge>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
