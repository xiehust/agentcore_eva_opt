import {
  createContext,
  useContext,
  useEffect,
  useReducer,
  useRef,
  type Dispatch,
  type ReactNode,
} from "react";
import { createElement } from "react";
import type { StepKey } from "../data/codeSnippets";
import { makeLiveApi } from "../lib/liveApi";
import { getSessionId, isValidSnapshot, toSnapshot } from "../lib/persistence";

/** The 9 step keys, in order (mirror the notebook Steps 1–9). */
export const STEP_ORDER: StepKey[] = [
  "config",
  "deploy",
  "baseline",
  "eval",
  "recommend",
  "bundles",
  "bundleAB",
  "targetAB",
  "cleanup",
];

export type StepStatus = "locked" | "active" | "done";

/** Execution mode: "sim" (default, no AWS) or "live" (real bedrock-agentcore). */
export type Mode = "sim" | "live";

/** Optional per-session AWS credentials for live mode. Never persisted. */
export interface LiveCreds {
  accessKeyId?: string;
  secretAccessKey?: string;
  sessionToken?: string;
  region?: string;
}

export interface LiveIdentity {
  account: string;
  arn: string;
  region: string;
}

/** Shared artifacts accumulated as the journey runs. All optional. */
export interface JourneyArtifacts {
  suffix?: string;
  v1Name?: string;
  v2Name?: string;
  agentArn?: string;
  agentId?: string;
  logGroup?: string;
  serviceName?: string;
  baselineBundleId?: string;
  baselineBundleVersion?: string;
  baselineSessionIds?: string; // comma-joined short ids — rehydrates the Step 3 log
  evalScores?: string; // JSON [{evaluatorId,score}] — rehydrates the Step 4 grid
  controlBundleId?: string;
  controlBundleVersion?: string;
  treatmentBundleId?: string;
  treatmentBundleVersion?: string;
  recommendationsAccepted?: boolean;
  bundlePromoted?: boolean;
  customEvaluatorId?: string; // sample custom evaluator (step 4, live)
  // ─── Live A/B artifacts (step 7 + 8) ───
  gatewayId?: string;
  gatewayArn?: string;
  roleArn?: string;
  onlineEvalArnV1?: string; // v1 online-eval, created in step 7, reused by step 8
  bundleAbTestId?: string;
  gwTrafficSent?: boolean;
  agentArnV2?: string;
  logGroupV2?: string;
  serviceNameV2?: string;
  targetAbTestId?: string;
  targetTrafficSent?: boolean;
  rolloutWeight?: number; // T1 (v2) weight: 10 → 50 → 100
  [key: string]: string | number | boolean | undefined;
}

export interface JourneyState {
  started: boolean;
  activeStep: StepKey;
  status: Record<StepKey, StepStatus>;
  artifacts: JourneyArtifacts;
  /** "sim" by default; "live" issues real AWS calls via the backend. */
  mode: Mode;
  liveCreds: LiveCreds;
  liveIdentity?: LiveIdentity;
  /** Backend base URL (dev proxy default "/api"). */
  apiBase: string;
}

export type JourneyAction =
  | { type: "START_JOURNEY" }
  | { type: "GO_TO"; step: StepKey }
  | { type: "COMPLETE_STEP"; step: StepKey; artifacts?: JourneyArtifacts }
  | { type: "SET_ARTIFACT"; artifacts: JourneyArtifacts }
  | { type: "SET_MODE"; mode: Mode }
  | { type: "SET_CREDS"; creds: LiveCreds }
  | { type: "SET_IDENTITY"; identity: LiveIdentity | undefined }
  /** Restore a persisted (credential-free) snapshot from the backend. */
  | {
      type: "HYDRATE";
      snapshot: Pick<
        JourneyState,
        "started" | "activeStep" | "status" | "artifacts" | "mode"
      >;
    }
  | { type: "RESET" };

function initialStatus(): Record<StepKey, StepStatus> {
  const s = {} as Record<StepKey, StepStatus>;
  STEP_ORDER.forEach((k, i) => (s[k] = i === 0 ? "active" : "locked"));
  return s;
}

export function initialState(): JourneyState {
  return {
    started: false,
    activeStep: "config",
    status: initialStatus(),
    artifacts: {},
    mode: "sim",
    liveCreds: {},
    liveIdentity: undefined,
    apiBase: "/api",
  };
}

/** True when every step before `step` is done (so it may be navigated to). */
export function isReachable(state: JourneyState, step: StepKey): boolean {
  return state.status[step] !== "locked";
}

export function journeyReducer(
  state: JourneyState,
  action: JourneyAction,
): JourneyState {
  switch (action.type) {
    case "START_JOURNEY":
      return { ...state, started: true, activeStep: "config" };

    case "GO_TO":
      // Only navigate to a step that is not locked — except in live mode the
      // cleanup step is always reachable (so a live run can always tear down).
      if (
        state.status[action.step] === "locked" &&
        !(state.mode === "live" && action.step === "cleanup")
      ) {
        return state;
      }
      return { ...state, activeStep: action.step };

    case "COMPLETE_STEP": {
      const idx = STEP_ORDER.indexOf(action.step);
      const status = { ...state.status, [action.step]: "done" as StepStatus };
      const next = STEP_ORDER[idx + 1];
      if (next && status[next] === "locked") status[next] = "active";
      return {
        ...state,
        status,
        activeStep: next ?? action.step,
        artifacts: { ...state.artifacts, ...action.artifacts },
      };
    }

    case "SET_ARTIFACT":
      return {
        ...state,
        artifacts: { ...state.artifacts, ...action.artifacts },
      };

    case "SET_MODE":
      return { ...state, mode: action.mode };

    case "SET_CREDS":
      return { ...state, liveCreds: action.creds };

    case "SET_IDENTITY":
      return { ...state, liveIdentity: action.identity };

    case "HYDRATE":
      // Restore persisted progress; keep live connection state (creds/identity/
      // apiBase) from the current in-memory state — snapshots never carry creds.
      return {
        ...state,
        started: action.snapshot.started,
        activeStep: action.snapshot.activeStep,
        status: action.snapshot.status,
        artifacts: action.snapshot.artifacts,
        mode: action.snapshot.mode,
      };

    case "RESET":
      // Reset journey progress but keep the live-mode setup (mode, creds,
      // identity, apiBase) so the operator doesn't lose their connection.
      return {
        ...initialState(),
        mode: state.mode,
        liveCreds: state.liveCreds,
        liveIdentity: state.liveIdentity,
        apiBase: state.apiBase,
      };

    default:
      return state;
  }
}

interface JourneyContextValue {
  state: JourneyState;
  dispatch: Dispatch<JourneyAction>;
}

const JourneyContext = createContext<JourneyContextValue | null>(null);

export function JourneyProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(journeyReducer, undefined, initialState);
  const hydratedRef = useRef(false);
  const saveTimer = useRef<number | undefined>(undefined);

  // Rehydrate persisted (credential-free) progress on mount. Best-effort: if
  // the backend is down or there's no saved session, start fresh silently.
  useEffect(() => {
    const api = makeLiveApi(state.apiBase);
    api
      .loadSession(getSessionId())
      .then((resp) => {
        if (isValidSnapshot(resp.data)) {
          dispatch({ type: "HYDRATE", snapshot: resp.data });
        }
      })
      .catch(() => {
        /* no saved session or backend unreachable — start fresh */
      })
      .finally(() => {
        hydratedRef.current = true;
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist a credential-free snapshot on change (debounced). Only after the
  // initial hydrate, so we never overwrite saved state with the fresh default.
  useEffect(() => {
    if (!hydratedRef.current) return;
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      const api = makeLiveApi(state.apiBase);
      api.saveSession(getSessionId(), toSnapshot(state)).catch(() => {
        /* backend unreachable — progress stays in memory */
      });
    }, 400);
    return () => window.clearTimeout(saveTimer.current);
  }, [state]);

  return createElement(
    JourneyContext.Provider,
    { value: { state, dispatch } },
    children,
  );
}

export function useJourney(): JourneyContextValue {
  const ctx = useContext(JourneyContext);
  if (!ctx) throw new Error("useJourney must be used within a JourneyProvider");
  return ctx;
}
