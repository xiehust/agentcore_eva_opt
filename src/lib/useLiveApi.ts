import { useMemo } from "react";
import { useJourney } from "../state/journey";
import { makeLiveApi } from "./liveApi";

/** Convenience hook: the live API client + current mode/creds from journey state. */
export function useLiveApi() {
  const { state } = useJourney();
  const api = useMemo(() => makeLiveApi(state.apiBase), [state.apiBase]);
  return {
    api,
    isLive: state.mode === "live",
    creds: state.liveCreds,
    identity: state.liveIdentity,
  };
}
