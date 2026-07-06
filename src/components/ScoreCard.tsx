import { motion } from "framer-motion";
import { cn } from "../lib/cn";

interface ScoreCardProps {
  label: string;
  /** 0..1 */
  score: number;
  /** Optional baseline to compare against (renders a delta). */
  baseline?: number;
}

/** Evaluator score tile with an animated 0–1 bar and color by tier. */
export function ScoreCard({ label, score, baseline }: ScoreCardProps) {
  const pct = Math.round(score * 100);
  const tier =
    score >= 0.85 ? "ok" : score >= 0.7 ? "warn" : "danger";
  const barColor = {
    ok: "bg-ok",
    warn: "bg-aws-orange",
    danger: "bg-danger",
  }[tier];

  return (
    <div className="rounded-md border border-line bg-ink-750/60 px-4 py-3.5">
      <div className="eyebrow mb-2">{label}</div>
      <div className="flex items-baseline gap-2">
        <span className="font-display text-3xl font-bold text-fog-100">
          {score.toFixed(2)}
        </span>
        <span className="font-mono text-xs text-fog-500">/ 1.00</span>
        {baseline !== undefined && (
          <span
            className={cn(
              "ml-auto font-mono text-xs font-semibold",
              score >= baseline ? "text-ok" : "text-danger",
            )}
          >
            {score >= baseline ? "+" : ""}
            {((score - baseline) * 100).toFixed(1)}
          </span>
        )}
      </div>
      <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-ink-600">
        <motion.div
          className={cn("h-full rounded-full", barColor)}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        />
      </div>
    </div>
  );
}
