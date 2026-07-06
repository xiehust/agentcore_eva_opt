import type { ReactNode } from "react";
import { cn } from "../../lib/cn";

interface StatProps {
  label: string;
  value: ReactNode;
  /** Optional delta string e.g. "+12.4%". */
  delta?: string;
  deltaTone?: "up" | "down" | "flat";
  /** Render the value in monospace (for ARNs/IDs/numbers). */
  mono?: boolean;
  /** Allow long monospace values to wrap/break instead of overflowing. */
  truncate?: boolean;
  className?: string;
  hint?: string;
}

const deltaTone: Record<NonNullable<StatProps["deltaTone"]>, string> = {
  up: "text-ok",
  down: "text-danger",
  flat: "text-fog-500",
};

/** A labeled metric tile. Values default to the display font; pass `mono` for data. */
export function Stat({
  label,
  value,
  delta,
  deltaTone: tone = "up",
  mono = false,
  truncate = false,
  className,
  hint,
}: StatProps) {
  return (
    <div
      className={cn(
        "rounded-md border border-line bg-ink-750/60 px-4 py-3",
        className,
      )}
    >
      <div className="eyebrow mb-1.5">{label}</div>
      <div className="flex items-baseline gap-2">
        <span
          className={cn(
            "text-fog-100",
            mono ? "font-mono text-sm" : "font-display text-2xl font-bold",
            truncate && "block w-full truncate",
          )}
          title={truncate && typeof value === "string" ? value : undefined}
        >
          {value}
        </span>
        {delta && (
          <span className={cn("font-mono text-xs font-semibold", deltaTone[tone])}>
            {delta}
          </span>
        )}
      </div>
      {hint && <p className="mt-1 text-xs text-fog-500">{hint}</p>}
    </div>
  );
}
