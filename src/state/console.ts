/**
 * Console UI state (Live mode). Small Context+useReducer store for navigation
 * and cross-page intents ("run with this agent"). Server data (agents,
 * datasets, runs) is NOT kept here — pages fetch it via useResource.
 */
import {
  createContext,
  createElement,
  useContext,
  useReducer,
  type Dispatch,
  type ReactNode,
} from "react";

export type ConsoleSection =
  | "agents"
  | "datasets"
  | "evaluators"
  | "runs"
  | "experiments"
  | "cleanup";

const SECTIONS: ConsoleSection[] = [
  "agents",
  "datasets",
  "evaluators",
  "runs",
  "experiments",
  "cleanup",
];

export interface ConsoleState {
  section: ConsoleSection;
  /** Agent open in the editor (undefined = list view). */
  editingAgentId?: string | "new";
  /** Dataset open in the editor (undefined = list view). */
  editingDatasetId?: string | "new";
  /** Pre-filled selection when jumping to Runs from an agent card. */
  runDraft?: { agentId?: string; datasetId?: string };
  /** Experiment open in the detail view (undefined = list view). */
  viewingExperimentId?: string;
}

export type ConsoleAction =
  | { type: "GO_SECTION"; section: ConsoleSection }
  | { type: "EDIT_AGENT"; agentId?: string | "new" }
  | { type: "EDIT_DATASET"; datasetId?: string | "new" }
  | { type: "START_RUN_WITH"; agentId?: string; datasetId?: string }
  | { type: "OPEN_EXPERIMENT"; experimentId?: string };

const SECTION_KEY = "lab4.consoleSection";

function loadSection(): ConsoleSection {
  try {
    const s = localStorage.getItem(SECTION_KEY);
    if (SECTIONS.includes(s as ConsoleSection)) return s as ConsoleSection;
  } catch {
    /* storage unavailable */
  }
  return "agents";
}

function reducer(state: ConsoleState, action: ConsoleAction): ConsoleState {
  switch (action.type) {
    case "GO_SECTION":
      try {
        localStorage.setItem(SECTION_KEY, action.section);
      } catch {
        /* storage unavailable */
      }
      // Leaving a section closes its editor/detail views.
      return {
        ...state,
        section: action.section,
        editingAgentId: undefined,
        editingDatasetId: undefined,
        viewingExperimentId: undefined,
      };
    case "EDIT_AGENT":
      return { ...state, editingAgentId: action.agentId };
    case "EDIT_DATASET":
      return { ...state, editingDatasetId: action.datasetId };
    case "OPEN_EXPERIMENT":
      return { ...state, viewingExperimentId: action.experimentId };
    case "START_RUN_WITH":
      try {
        localStorage.setItem(SECTION_KEY, "runs");
      } catch {
        /* storage unavailable */
      }
      return {
        ...state,
        section: "runs",
        runDraft: { agentId: action.agentId, datasetId: action.datasetId },
      };
    default:
      return state;
  }
}

interface ConsoleContextValue {
  state: ConsoleState;
  dispatch: Dispatch<ConsoleAction>;
}

const ConsoleContext = createContext<ConsoleContextValue | null>(null);

export function ConsoleProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, () => ({
    section: loadSection(),
  }));
  return createElement(ConsoleContext.Provider, { value: { state, dispatch } }, children);
}

export function useConsole(): ConsoleContextValue {
  const ctx = useContext(ConsoleContext);
  if (!ctx) throw new Error("useConsole must be used within ConsoleProvider");
  return ctx;
}
