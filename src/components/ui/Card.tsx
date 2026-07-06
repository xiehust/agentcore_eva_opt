import type { ReactNode } from "react";
import { cn } from "../../lib/cn";

interface CardProps {
  /** Optional monospace eyebrow label rendered above the title. */
  eyebrow?: string;
  title?: ReactNode;
  /** Right-aligned slot in the header (badges, actions). */
  action?: ReactNode;
  children?: ReactNode;
  className?: string;
  /** Accent the left edge with a signal color. */
  accent?: "orange" | "cyan" | "danger" | "none";
}

const accentBar: Record<NonNullable<CardProps["accent"]>, string> = {
  orange: "before:bg-aws-orange",
  cyan: "before:bg-cyan",
  danger: "before:bg-danger",
  none: "before:bg-transparent",
};

/** A titled console panel — the workhorse container of the mission-control UI. */
export function Card({
  eyebrow,
  title,
  action,
  children,
  className,
  accent = "none",
}: CardProps) {
  return (
    <section
      className={cn(
        "relative overflow-hidden rounded-lg border border-line bg-ink-800/80 panel-glow",
        "before:absolute before:left-0 before:top-0 before:h-full before:w-[3px] before:content-['']",
        accentBar[accent],
        className,
      )}
    >
      {(eyebrow || title || action) && (
        <header className="flex items-start justify-between gap-4 border-b border-line/70 px-5 py-3.5">
          <div className="min-w-0">
            {eyebrow && <div className="eyebrow mb-1">{eyebrow}</div>}
            {title && (
              <h3 className="font-display text-base font-semibold leading-tight text-fog-100">
                {title}
              </h3>
            )}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </header>
      )}
      <div className="px-5 py-4">{children}</div>
    </section>
  );
}
