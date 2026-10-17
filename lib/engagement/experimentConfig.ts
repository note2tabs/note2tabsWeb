import type { EngagementSnapshot } from "./policy";
export const ENGAGEMENT_EXPERIMENT = "engagement-policy-v1";
export const ENGAGEMENT_CTA_DELAY_MS = 1200;
export const ENGAGEMENT_EXPERIMENT_ARMS = ["control", "existing", "contextual"] as const;
export type EngagementArm = typeof ENGAGEMENT_EXPERIMENT_ARMS[number];
export function contextualValueScore(s: EngagementSnapshot) {
  // Frozen hypothesis: evidence from earlier cohort plus explicit export/import
  // hypotheses. Not a probability; eligibility overrides cannot be outweighed.
  return (s.practices > 0 ? 4 : 0) + (s.edits > 0 ? 1 : 0) + (s.saved > 0 ? 1 : 0)
    + (s.pricingDays > 0 ? 2 : 0) + (s.successes >= 2 ? 2 : 0)
    + (s.exports > 0 ? 4 : 0) + (s.imports > 0 ? 2 : 0);
}
export function contextualPremiumAllowed(s: EngagementSnapshot, paid: boolean, safe: boolean) {
  return s.complete && !paid && !s.subscribed && safe && !s.checkoutActive && !s.unresolvedFailure && s.valueTypes.length > 0
    && (s.lastDismissedAt === null || s.at - s.lastDismissedAt >= 7 * 86400000)
    && (s.lastPromptAt === null || s.at - s.lastPromptAt >= 86400000)
    && (s.limitNeed || contextualValueScore(s) >= 6);
}
