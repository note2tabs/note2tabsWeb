export const CREDIT_PACK_SIZE = 15;
// Stripe's USD amount ceiling; all arithmetic stays in integer cents.
export const MAX_CREDIT_PACKS = 999999;
export function creditTopUpQuote(credits: unknown) {
  if (
    typeof credits !== "number" ||
    !Number.isSafeInteger(credits) ||
    credits < 15 ||
    credits % 15 !== 0 ||
    credits / 15 > MAX_CREDIT_PACKS
  ) {
    throw new Error("Choose at least 15 credits, in increments of 15.");
  }
  return {
    credits,
    packs: credits / 15,
    amountCents: (credits / 15) * 100 + 49,
    currency: "usd" as const,
  };
}
export function creditTopUpsEnabled() {
  return process.env.CREDIT_TOPUPS_ENABLED === "true";
}
export function monthlyCreditGrant(
  balance: number,
  grant: number,
  cap: number,
) {
  return Math.max(balance, Math.min(cap, balance + grant));
}
