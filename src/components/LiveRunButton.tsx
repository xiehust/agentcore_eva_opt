import { useRef, useState } from "react";
import { Button } from "./ui";
import { cn } from "../lib/cn";

type Phase = "idle" | "running" | "done" | "error";

interface LiveRunButtonProps<T> {
  label: string;
  doneLabel?: string;
  /** The real async operation (calls the backend, polls jobs, etc.). */
  run: (onProgress: (msg: string) => void) => Promise<T>;
  onComplete?: (result: T) => void;
  variant?: "primary" | "secondary";
  className?: string;
}

/**
 * Runs a real backend operation with live progress, guarded against double-fire,
 * and renders a readable error + retry instead of crashing on failure.
 */
export function LiveRunButton<T = unknown>({
  label,
  doneLabel = "Complete",
  run,
  onComplete,
  variant = "primary",
  className,
}: LiveRunButtonProps<T>) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState<string>("");
  const [error, setError] = useState<string>("");
  const busy = useRef(false);

  const start = async () => {
    if (busy.current) return;
    busy.current = true;
    setPhase("running");
    setError("");
    setProgress("");
    try {
      const result = await run((msg) => setProgress(msg));
      setPhase("done");
      onComplete?.(result);
    } catch (e) {
      setPhase("error");
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      busy.current = false;
    }
  };

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center gap-3">
        <Button
          variant={variant}
          onClick={start}
          disabled={phase === "running" || phase === "done"}
          aria-busy={phase === "running"}
        >
          {phase === "idle" && label}
          {phase === "running" && (
            <span className="inline-flex items-center gap-2">
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-ink-900/40 border-t-ink-900" />
              Running…
            </span>
          )}
          {phase === "done" && `${doneLabel} ✓`}
          {phase === "error" && `↻ Retry`}
        </Button>
        {phase === "running" && progress && (
          <span className="font-mono text-xs text-aws-orange-soft">{progress}</span>
        )}
      </div>
      {phase === "error" && (
        <div
          role="alert"
          className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger"
        >
          {error}
        </div>
      )}
    </div>
  );
}
