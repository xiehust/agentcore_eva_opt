import type { Scenario } from "./liveApi";

/** Default Bedrock model for the user-simulation actor (devguide example). */
export const DEFAULT_ACTOR_MODEL_ID = "global.anthropic.claude-haiku-4-5-20251001-v1:0";

/** Which evaluators receive ground truth from the dataset's fields
 *  (devguide "Ground truth mapping" table). */
export function groundTruthHints(
  scenarios: Scenario[],
): { evaluatorId: string; field: string }[] {
  const hints: { evaluatorId: string; field: string }[] = [];
  if (scenarios.some((s) => s.turns?.some((turn) => turn.expected_response))) {
    hints.push({ evaluatorId: "Builtin.Correctness", field: "expected_response" });
  }
  if (scenarios.some((s) => s.assertions?.length)) {
    hints.push({ evaluatorId: "Builtin.GoalSuccessRate", field: "assertions" });
  }
  if (scenarios.some((s) => s.expected_trajectory?.length)) {
    for (const id of [
      "Builtin.TrajectoryExactOrderMatch",
      "Builtin.TrajectoryInOrderMatch",
      "Builtin.TrajectoryAnyOrderMatch",
    ]) {
      hints.push({ evaluatorId: id, field: "expected_trajectory" });
    }
  }
  return hints;
}
