import { useJourney } from "../state/journey";
import { cn } from "../lib/cn";
import { useLang } from "../i18n/lang";

/** Sim ⇄ Live segmented control for the header. */
export function ModeToggle() {
  const { state, dispatch } = useJourney();
  const { t } = useLang();
  const mode = state.mode;

  return (
    <div
      role="group"
      aria-label={t.mode.groupLabel}
      className="inline-flex items-center rounded-md border border-line-bright bg-ink-800/80 p-0.5"
    >
      {(["sim", "live"] as const).map((m) => {
        const active = mode === m;
        return (
          <button
            key={m}
            type="button"
            aria-pressed={active}
            onClick={() => dispatch({ type: "SET_MODE", mode: m })}
            className={cn(
              "rounded px-3 py-1 font-mono text-xs uppercase tracking-wider transition-colors",
              active && m === "live"
                ? "bg-aws-orange text-ink-900 font-semibold"
                : active
                  ? "bg-ink-700 text-fog-100"
                  : "text-fog-500 hover:text-fog-300",
            )}
          >
            {m === "sim" ? t.mode.sim : t.mode.live}
          </button>
        );
      })}
    </div>
  );
}
