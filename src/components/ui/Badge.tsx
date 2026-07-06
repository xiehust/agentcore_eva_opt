import type { ReactNode } from "react";
import { cn } from "../../lib/cn";

export type BadgeVariant =
  | "neutral"
  | "orange"
  | "cyan"
  | "ok"
  | "warn"
  | "danger"
  | "info";

interface BadgeProps {
  children: ReactNode;
  variant?: BadgeVariant;
  /** Show a small leading status dot. */
  dot?: boolean;
  /** Pulse the dot (for "live"/running states). */
  pulse?: boolean;
  className?: string;
  mono?: boolean;
}

const styles: Record<BadgeVariant, { box: string; dot: string }> = {
  neutral: { box: "border-line-bright/60 bg-ink-700/60 text-fog-300", dot: "bg-fog-500" },
  orange: { box: "border-aws-orange/40 bg-aws-orange/10 text-aws-orange-soft", dot: "bg-aws-orange" },
  cyan: { box: "border-cyan/40 bg-cyan/10 text-cyan-soft", dot: "bg-cyan" },
  ok: { box: "border-ok/40 bg-ok/10 text-ok", dot: "bg-ok" },
  warn: { box: "border-warn/40 bg-warn/10 text-warn", dot: "bg-warn" },
  danger: { box: "border-danger/40 bg-danger/10 text-danger", dot: "bg-danger" },
  info: { box: "border-info/40 bg-info/10 text-info", dot: "bg-info" },
};

/** Compact status pill. Use `dot` for state, `pulse` for live activity. */
export function Badge({
  children,
  variant = "neutral",
  dot = false,
  pulse = false,
  className,
  mono = false,
}: BadgeProps) {
  const s = styles[variant];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
        mono && "font-mono tracking-tight",
        s.box,
        className,
      )}
    >
      {dot && (
        <span
          className={cn("h-1.5 w-1.5 rounded-full", s.dot, pulse && "animate-pulse-dot")}
        />
      )}
      {children}
    </span>
  );
}
