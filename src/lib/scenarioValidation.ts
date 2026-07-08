import type { DatasetKind, Scenario } from "./liveApi";

/** Cheap client-side shape check before the server-side pydantic pass. */
export function validateScenarioJson(kind: DatasetKind, text: string): Scenario[] {
  const parsed: unknown = JSON.parse(text);
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error("expected a non-empty JSON array of scenarios");
  }
  for (const s of parsed as Scenario[]) {
    if (!s || typeof s !== "object" || !s.scenario_id) {
      throw new Error("every scenario needs a scenario_id");
    }
    if (kind === "predefined" && (!Array.isArray(s.turns) || s.turns.length === 0)) {
      throw new Error(`scenario "${s.scenario_id}": predefined scenarios need turns[]`);
    }
    if (kind === "simulated") {
      if (!s.actor_profile?.context || !s.actor_profile.goal) {
        throw new Error(
          `scenario "${s.scenario_id}": simulated scenarios need actor_profile {context, goal}`,
        );
      }
      if (!s.input) throw new Error(`scenario "${s.scenario_id}": simulated scenarios need input`);
    }
  }
  return parsed as Scenario[];
}
