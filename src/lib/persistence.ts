/**
 * Journey persistence — save/restore progress across page reloads and backend
 * restarts via the backend's SQLite-backed /api/session endpoints.
 *
 * The stable session id lives in localStorage (id only — NOT credentials).
 * The snapshot deliberately EXCLUDES `liveCreds` and `liveIdentity` so no
 * secret ever leaves the browser or lands in the database.
 */
import type { JourneyState } from "../state/journey";

const SESSION_ID_KEY = "lab4.sessionId";

/** A serializable subset of the journey — never includes credentials. */
export interface PersistedJourney {
  started: boolean;
  activeStep: JourneyState["activeStep"];
  status: JourneyState["status"];
  artifacts: JourneyState["artifacts"];
  mode: JourneyState["mode"];
}

/** Stable per-browser session id (created once, kept in localStorage). */
export function getSessionId(): string {
  try {
    let id = localStorage.getItem(SESSION_ID_KEY);
    if (!id) {
      id =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `sess-${Date.now()}-${Math.floor(Math.random() * 1e9).toString(36)}`;
      localStorage.setItem(SESSION_ID_KEY, id);
    }
    return id;
  } catch {
    // localStorage unavailable (private mode / SSR) — ephemeral id.
    return "ephemeral";
  }
}

/** Build the credential-free snapshot to persist. */
export function toSnapshot(state: JourneyState): PersistedJourney {
  return {
    started: state.started,
    activeStep: state.activeStep,
    status: state.status,
    artifacts: state.artifacts,
    mode: state.mode,
  };
}

/** Validate an untrusted snapshot loaded from the backend. */
export function isValidSnapshot(v: unknown): v is PersistedJourney {
  if (!v || typeof v !== "object") return false;
  const s = v as Record<string, unknown>;
  return (
    typeof s.activeStep === "string" &&
    typeof s.status === "object" &&
    s.status !== null &&
    (s.mode === "sim" || s.mode === "live")
  );
}
