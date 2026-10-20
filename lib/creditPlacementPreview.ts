/** Local visual preview data only. Never used to authenticate an API request. */
export const creditPlacementPreview = {
  user: {
    id: "local-credit-preview",
    email: "preview@example.test",
    name: "Preview account",
    role: "PREMIUM",
    subscriptionPlan: "PREMIUM",
    createdAt: "2026-10-10T12:00:00Z",
    isEmailVerified: true,
    monthlyCreditsUsed: 92,
    monthlyCreditsLimit: 100,
    monthlyCreditsRemaining: 8,
    monthlyCreditsResetAt: "2026-11-10T12:00:00Z",
  },
  expires: "2099-01-01T00:00:00Z",
};

/** Deployment-scoped review mode is never available on production. */
export function creditPlacementReviewEnabled() {
  return (
    process.env.NODE_ENV === "development" ||
    (process.env.VERCEL_ENV === "preview" &&
      process.env.CREDIT_PURCHASE_REVIEW === "true" &&
      !process.env.STRIPE_SECRET_KEY)
  );
}
