import { useState } from "react";
import { useJourney } from "../state/journey";
import { getStep, STEPS } from "../steps/manifest";
import { Stepper } from "./Stepper";
import { CodeViewPanel } from "./CodeViewPanel";
import { ModeToggle } from "./ModeToggle";
import { LiveBanner } from "./LiveBanner";
import { CredentialsPanel } from "./CredentialsPanel";
import { Badge, Button } from "./ui";
import { FAKE_ACCOUNT_ID, DEFAULT_REGION } from "../sim/engine";
import { makeLiveApi } from "../lib/liveApi";
import { getSessionId } from "../lib/persistence";
import { cn } from "../lib/cn";
import { useLang } from "../i18n/lang";
import { LangToggle } from "../i18n";

/**
 * The journey frame: header (title + account/region badges + reset), the
 * 9-step stepper, the active step body, and a toggleable boto3 code view.
 */
export function StepShell() {
  const { state, dispatch } = useJourney();
  const { t } = useLang();
  const [showCode, setShowCode] = useState(false);

  const active = getStep(state.activeStep);
  const ActiveStep = active.component;
  const doneCount = STEPS.filter((s) => state.status[s.key] === "done").length;
  const isLive = state.mode === "live";

  return (
    <div className="min-h-screen">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header
        data-testid="shell-header"
        className="sticky top-0 z-20 border-b border-line bg-ink-850/85 backdrop-blur"
      >
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2.5">
            <span className="grid h-7 w-7 place-items-center rounded bg-aws-orange font-display text-sm font-black text-ink-900">
              A
            </span>
            <span className="font-display text-sm font-bold text-fog-100">
              {t.shell.appTitle}
            </span>
          </div>
          <div className="hidden items-center gap-2 sm:flex">
            <Badge variant="neutral" mono>
              {t.shell.acct}{" "}
              {isLive ? (state.liveIdentity?.account ?? "IAM role") : FAKE_ACCOUNT_ID}
            </Badge>
            <Badge variant="neutral" mono>
              {isLive ? (state.liveIdentity?.region ?? DEFAULT_REGION) : DEFAULT_REGION}
            </Badge>
            {isLive ? (
              <Badge variant="orange" dot pulse mono>
                {t.shell.live}
              </Badge>
            ) : (
              <Badge variant="cyan" dot pulse mono>
                {t.shell.simulation}
              </Badge>
            )}
          </div>
          <div className="ml-auto flex items-center gap-3">
            <LangToggle />
            <ModeToggle />
            <span className="hidden font-mono text-xs text-fog-500 sm:inline">
              {t.shell.complete(doneCount, STEPS.length)}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                dispatch({ type: "RESET" });
                setShowCode(false);
                // Clear the persisted snapshot so a reset truly starts fresh.
                makeLiveApi(state.apiBase)
                  .deleteSession(getSessionId())
                  .catch(() => {
                    /* backend unreachable — in-memory reset already applied */
                  });
              }}
            >
              {t.shell.reset}
            </Button>
          </div>
        </div>
      </header>

      <LiveBanner />

      {/* ── Body ────────────────────────────────────────────────────────── */}
      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="min-w-0">
          <Stepper />
        </aside>

        <main className="min-w-0">
          <div className="mb-4 flex items-center justify-end">
            <button
              type="button"
              onClick={() => setShowCode((v) => !v)}
              aria-pressed={showCode}
              className={cn(
                "rounded-md border px-3 py-1.5 font-mono text-xs transition-colors",
                showCode
                  ? "border-cyan/50 bg-cyan/10 text-cyan-soft"
                  : "border-line-bright text-fog-500 hover:border-cyan/40 hover:text-cyan-soft",
              )}
            >
              {showCode ? t.shell.hideCode : t.shell.showCode}
            </button>
          </div>

          <CodeViewPanel step={state.activeStep} open={showCode} />

          {isLive && <div className="mt-4"><CredentialsPanel /></div>}

          <div className="mt-2">
            <ActiveStep />
          </div>
        </main>
      </div>
    </div>
  );
}
