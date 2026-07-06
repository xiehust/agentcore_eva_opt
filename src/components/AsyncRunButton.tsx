import { useCallback, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Button } from "./ui";
import { cn } from "../lib/cn";
import { simulateAsync } from "../sim/engine";
import type { SimStage, SimProgress, StageStatus } from "../sim/types";

interface AsyncRunButtonProps<T> {
  /** Button label when idle. */
  label: string;
  /** Label when complete (defaults to "Done"). */
  doneLabel?: string;
  /** Stages to animate through. */
  stages: SimStage[];
  /** Speed multiplier passed to the engine. */
  speed?: number;
  /** Produce the result handed to onComplete after the stages finish. */
  result?: () => T;
  /** Called once when the run completes. */
  onComplete?: (result: T) => void;
  variant?: "primary" | "secondary";
  className?: string;
  /** Render once complete (e.g. a "Re-run" affordance is hidden by default). */
  allowRerun?: boolean;
}

type Phase = "idle" | "running" | "done";

const statusDot: Record<"pending" | "running" | "done", string> = {
  pending: "bg-fog-600",
  running: "bg-aws-orange animate-pulse-dot",
  done: "bg-ok",
};

/**
 * Runs a simulated multi-stage operation, showing live staged progress, then
 * marks complete. Prevents double-fire while running and is keyboard-operable
 * (it renders a real <button>).
 */
export function AsyncRunButton<T = void>({
  label,
  doneLabel = "Complete",
  stages,
  speed = 1,
  result,
  onComplete,
  variant = "primary",
  className,
  allowRerun = false,
}: AsyncRunButtonProps<T>) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState<Record<number, StageStatus>>({});
  const runningRef = useRef(false);

  const run = useCallback(async () => {
    if (runningRef.current) return; // guard against double-fire
    runningRef.current = true;
    setPhase("running");
    setProgress({});

    await simulateAsync(stages, {
      speed,
      onProgress: (p: SimProgress) =>
        setProgress((prev) => ({ ...prev, [p.index]: p.status })),
    });

    setPhase("done");
    runningRef.current = false;
    onComplete?.(result ? result() : (undefined as T));
  }, [stages, speed, onComplete, result]);

  return (
    <div className={cn("space-y-3", className)}>
      <Button
        variant={variant}
        onClick={run}
        disabled={phase === "running" || (phase === "done" && !allowRerun)}
        aria-busy={phase === "running"}
      >
        {phase === "idle" && label}
        {phase === "running" && (
          <span className="inline-flex items-center gap-2">
            <span className="h-3 w-3 animate-spin rounded-full border-2 border-ink-900/40 border-t-ink-900" />
            Running…
          </span>
        )}
        {phase === "done" && (allowRerun ? `↻ ${label}` : `${doneLabel} ✓`)}
      </Button>

      <AnimatePresence>
        {phase !== "idle" && (
          <motion.ul
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="space-y-1.5 overflow-hidden rounded-md border border-line bg-ink-900/60 p-3 font-mono text-xs"
          >
            {stages.map((stage, i) => {
              const st = progress[i] ?? "pending";
              return (
                <li key={stage.key} className="flex items-center gap-2.5">
                  <span
                    className={cn("h-1.5 w-1.5 shrink-0 rounded-full", statusDot[st])}
                  />
                  <span
                    className={cn(
                      st === "pending" && "text-fog-600",
                      st === "running" && "text-aws-orange-soft",
                      st === "done" && "text-fog-300",
                    )}
                  >
                    {stage.label}
                  </span>
                  {st === "done" && stage.terminal && (
                    <span className="ml-auto text-ok">{stage.terminal}</span>
                  )}
                  {st === "done" && !stage.terminal && (
                    <span className="ml-auto text-ok">ok</span>
                  )}
                </li>
              );
            })}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}
