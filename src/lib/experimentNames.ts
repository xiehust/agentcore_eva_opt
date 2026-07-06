/**
 * Deterministic AWS resource names derived from an experiment id, satisfying
 * the service constraints:
 *   GatewayName            ([0-9a-zA-Z][-]?){1,48}
 *   TargetName             ([0-9a-zA-Z][-]?){1,100}
 *   ABTestName             [a-zA-Z][a-zA-Z0-9_]{0,47}   (no hyphens!)
 *   EvaluationConfigName   [a-zA-Z][a-zA-Z0-9_]{0,47}
 *   RecommendationName     letter-first alnum (same-safe)
 */

export function sanitizeAlnum(s: string): string {
  return s.replace(/[^0-9a-zA-Z]/g, "");
}

export interface ExperimentNames {
  gateway: string;
  targetV1: string;
  targetV2: string;
  onlineEvalV1: string;
  onlineEvalV2: string;
  bundleAbTest: string;
  targetAbTest: string;
  controlBundle: string;
  treatmentBundle: string;
  spRecommendation: string;
  tdRecommendation: string;
}

/** All resource names for one experiment. Names are letter-prefixed so a
 * hex id starting with a digit still satisfies letter-first patterns. */
export function experimentNames(
  experimentId: string,
  agentName: string,
  challengerName?: string,
): ExperimentNames {
  const id = sanitizeAlnum(experimentId).slice(0, 12);
  const t1 = `t1${sanitizeAlnum(agentName).slice(0, 20) || "agent"}`;
  let t2 = `t2${sanitizeAlnum(challengerName ?? "").slice(0, 20) || "challenger"}`;
  if (t2.slice(2) === t1.slice(2)) t2 = `${t2}V2`;
  return {
    gateway: `xrgw-${id}`,
    targetV1: t1,
    targetV2: t2,
    onlineEvalV1: `xreval${id}`,
    onlineEvalV2: `xrevalv2${id}`,
    bundleAbTest: `xrbundle${id}`,
    targetAbTest: `xrtarget${id}`,
    controlBundle: `xrctl${id}`,
    treatmentBundle: `xrtrt${id}`,
    spRecommendation: `xrsp${id}`,
    tdRecommendation: `xrtd${id}`,
  };
}
