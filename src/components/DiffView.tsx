import { cn } from "../lib/cn";

interface DiffViewProps {
  before: string;
  after: string;
  beforeLabel?: string;
  afterLabel?: string;
  /** Stack columns vertically regardless of width. */
  stacked?: boolean;
  className?: string;
}

/**
 * Side-by-side before/after text comparison. The "after" pane is highlighted
 * when it differs from "before". This is intentionally a simple panel diff
 * (not a token-level LCS) — enough to make a change visually obvious.
 */
export function DiffView({
  before,
  after,
  beforeLabel = "Before",
  afterLabel = "After",
  stacked = false,
  className,
}: DiffViewProps) {
  const changed = before.trim() !== after.trim();
  return (
    <div
      className={cn(
        "grid gap-3",
        !stacked && "md:grid-cols-2",
        className,
      )}
      data-changed={changed}
    >
      <DiffPane
        label={beforeLabel}
        text={before}
        tone="before"
      />
      <DiffPane
        label={afterLabel}
        text={after}
        tone={changed ? "after-changed" : "after-same"}
      />
    </div>
  );
}

function DiffPane({
  label,
  text,
  tone,
}: {
  label: string;
  text: string;
  tone: "before" | "after-changed" | "after-same";
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-md border",
        tone === "before" && "border-line bg-ink-900/50",
        tone === "after-changed" && "border-ok/40 bg-ok/[0.06]",
        tone === "after-same" && "border-line bg-ink-900/50",
      )}
    >
      <div
        className={cn(
          "flex items-center justify-between border-b px-3 py-1.5",
          tone === "after-changed" ? "border-ok/30" : "border-line/60",
        )}
      >
        <span className="eyebrow">{label}</span>
        {tone === "after-changed" && (
          <span className="font-mono text-[0.625rem] uppercase tracking-widest text-ok">
            changed
          </span>
        )}
      </div>
      <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words px-3 py-2.5 font-mono text-xs leading-relaxed text-fog-300">
        {text}
      </pre>
    </div>
  );
}
