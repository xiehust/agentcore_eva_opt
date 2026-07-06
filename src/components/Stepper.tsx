import { useJourney } from "../state/journey";
import { STEPS } from "../steps/manifest";
import { cn } from "../lib/cn";
import { useLang } from "../i18n/lang";

/**
 * The 9-step journey navigator. Renders as a vertical rail on desktop and a
 * horizontal scroller on small screens. Each item is a real button with an
 * aria-label and visible focus; locked steps are disabled.
 */
export function Stepper() {
  const { state, dispatch } = useJourney();
  const { t } = useLang();

  return (
    <nav aria-label="Optimization journey steps" className="lg:sticky lg:top-6">
      <ol
        className={cn(
          "flex gap-1 overflow-x-auto pb-2 lg:flex-col lg:gap-0.5 lg:overflow-visible lg:pb-0",
        )}
      >
        {STEPS.map((step) => {
          const status = state.status[step.key];
          const isActive = state.activeStep === step.key;
          const locked = status === "locked";
          const meta = t.steps[step.key];
          return (
            <li key={step.key} className="shrink-0">
              <button
                type="button"
                disabled={locked}
                aria-current={isActive ? "step" : undefined}
                aria-label={`Step ${step.index}: ${meta.title}${
                  locked ? " (locked)" : status === "done" ? " (completed)" : ""
                }`}
                onClick={() => dispatch({ type: "GO_TO", step: step.key })}
                className={cn(
                  "group flex items-center gap-3 rounded-md px-3 py-2.5 text-left transition-colors lg:w-full",
                  "disabled:cursor-not-allowed",
                  isActive
                    ? "bg-ink-700/80 ring-1 ring-aws-orange/40"
                    : "hover:bg-ink-800/80",
                  locked && "opacity-45",
                )}
              >
                <span
                  className={cn(
                    "grid h-7 w-7 shrink-0 place-items-center rounded-full border font-mono text-xs transition-colors",
                    status === "done" &&
                      "border-ok/50 bg-ok/15 text-ok",
                    isActive &&
                      status !== "done" &&
                      "border-aws-orange bg-aws-orange/15 text-aws-orange-soft",
                    !isActive &&
                      status !== "done" &&
                      "border-line-bright bg-ink-800 text-fog-500",
                  )}
                >
                  {status === "done" ? "✓" : step.index}
                </span>
                <span className="min-w-0">
                  <span
                    className={cn(
                      "block truncate text-sm font-medium",
                      isActive ? "text-fog-100" : "text-fog-300",
                    )}
                  >
                    {meta.shortTitle}
                  </span>
                  <span className="hidden truncate text-xs text-fog-600 lg:block">
                    {meta.title}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
