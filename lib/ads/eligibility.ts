export type AdInteractionEligibility = {
  documentVisible: boolean;
  visibleRatio: number;
  minVisibleRatio: number;
  lastActivityAt: number;
  idleAfterMs: number;
  now: number;
};

const AD_FREE_ROLES = new Set(["PREMIUM", "ADMIN", "MODERATOR", "MOD"]);

export function hasAdFreeEntitlement(role: string | null | undefined) {
  return AD_FREE_ROLES.has((role || "").trim().toUpperCase());
}

export function isAdInteractionEligible(input: AdInteractionEligibility) {
  return (
    input.documentVisible &&
    input.visibleRatio >= input.minVisibleRatio &&
    input.now - input.lastActivityAt <= input.idleAfterMs
  );
}
