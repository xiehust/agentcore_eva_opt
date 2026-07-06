import { JourneyProvider, useJourney } from "./state/journey";
import { LangProvider } from "./i18n";
import { Landing } from "./components/Landing";
import { LoginGate } from "./components/LoginGate";
import { StepShell } from "./components/StepShell";
import { ConsoleShell } from "./console/ConsoleShell";

function JourneyRoot() {
  const { state } = useJourney();
  // Live mode is the real evaluation console; Sim keeps the guided wizard.
  if (state.mode === "live") return <ConsoleShell />;
  return state.started ? <StepShell /> : <Landing />;
}

export default function App() {
  return (
    <LangProvider>
      {/* Password gate first (no-op unless the backend requires auth), so the
          journey's session restore only runs once the API is reachable. */}
      <LoginGate>
        <JourneyProvider>
          <JourneyRoot />
        </JourneyProvider>
      </LoginGate>
    </LangProvider>
  );
}
