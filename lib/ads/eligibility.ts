export type AdInteractionEligibility = {
  documentVisible: boolean;
  visibleRatio: number;
  minVisibleRatio: number;
  lastActivityAt: number;
  idleAfterMs: number;
  now: number;
};

export function isAdInteractionEligible(input: AdInteractionEligibility) {
  return (
    input.documentVisible &&
    input.visibleRatio >= input.minVisibleRatio &&
    input.now - input.lastActivityAt <= input.idleAfterMs
  );
}

