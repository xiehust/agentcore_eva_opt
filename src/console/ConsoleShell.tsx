import { useJourney } from "../state/journey";
import { ConsoleProvider, useConsole, type ConsoleSection } from "../state/console";
import { ModeToggle } from "../components/ModeToggle";
import { LiveBanner } from "../components/LiveBanner";
import { CredentialsPanel } from "../components/CredentialsPanel";
import { Badge } from "../components/ui";
import { LangToggle } from "../i18n";
import { useLang } from "../i18n/lang";
import { cn } from "../lib/cn";
import { AgentsPage } from "./pages/AgentsPage";
import { DatasetsPage } from "./pages/DatasetsPage";
import { EvaluatorsPage } from "./pages/EvaluatorsPage";
import { RunsPage } from "./pages/RunsPage";
import { ExperimentsPage } from "./pages/ExperimentsPage";
import { CleanupPage } from "./pages/CleanupPage";

/**
 * The Live-mode console frame: header, credentials, section nav, active page.
 * Replaces the 9-step wizard whenever mode === "live"; Sim mode is untouched.
 */
export function ConsoleShell() {
  return (
    <ConsoleProvider>
      <ConsoleBody />
    </ConsoleProvider>
  );
}

const PAGES: Record<ConsoleSection, () => JSX.Element> = {
  agents: AgentsPage,
  datasets: DatasetsPage,
  evaluators: EvaluatorsPage,
  runs: RunsPage,
  experiments: ExperimentsPage,
  cleanup: CleanupPage,
};

function ConsoleBody() {
  const { state } = useJourney();
  const { state: consoleState } = useConsole();
  const { t } = useLang();
  const Page = PAGES[consoleState.section];

  return (
    <div className="min-h-screen">
      <header
        data-testid="console-header"
        className="sticky top-0 z-20 border-b border-line bg-ink-850/85 backdrop-blur"
      >
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2.5">
            <span className="grid h-7 w-7 place-items-center rounded bg-aws-orange font-display text-sm font-black text-ink-900">
              A
            </span>
            <span className="font-display text-sm font-bold text-fog-100">
              {t.console.title}
            </span>
          </div>
          <div className="hidden items-center gap-2 sm:flex">
            <Badge variant="neutral" mono>
              {t.shell.acct} {state.liveIdentity?.account ?? "IAM role"}
            </Badge>
            <Badge variant="neutral" mono>
              {state.liveIdentity?.region ?? "us-west-2"}
            </Badge>
            <Badge variant="orange" dot pulse mono>
              {t.shell.live}
            </Badge>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <LangToggle />
            <ModeToggle />
          </div>
        </div>
      </header>

      <LiveBanner />

      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="min-w-0">
          <ConsoleNav />
        </aside>
        <main className="min-w-0">
          <div className="mb-4">
            <CredentialsPanel />
          </div>
          <Page />
        </main>
      </div>
    </div>
  );
}

function ConsoleNav() {
  const { state, dispatch } = useConsole();
  const { t } = useLang();
  const sections: ConsoleSection[] = [
    "agents",
    "datasets",
    "evaluators",
    "runs",
    "experiments",
    "cleanup",
  ];

  return (
    <nav aria-label="Console sections" className="lg:sticky lg:top-6">
      <ol className="flex gap-1 overflow-x-auto pb-2 lg:flex-col lg:gap-0.5 lg:overflow-visible lg:pb-0">
        {sections.map((section) => {
          const isActive = state.section === section;
          return (
            <li key={section} className="shrink-0">
              <button
                type="button"
                aria-current={isActive ? "page" : undefined}
                onClick={() => dispatch({ type: "GO_SECTION", section })}
                className={cn(
                  "flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm transition-colors",
                  isActive
                    ? "bg-ink-700/80 text-fog-100 ring-1 ring-aws-orange/40"
                    : "text-fog-300 hover:bg-ink-800/80 hover:text-fog-100",
                )}
              >
                {t.console.nav[section]}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
