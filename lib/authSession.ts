import type { Session } from "next-auth";
import type { JWT } from "next-auth/jwt";
import type { CreditsSummary } from "./credits";

export type AuthUserState = {
  id?: string | null;
  role?: string | null;
  subscriptionPlan?: string | null;
  tokensRemaining?: number | null;
  emailVerified?: Date | null;
  emailVerifiedBool?: boolean | null;
  isEmailVerified?: boolean | null;
  unverifiedTranscriptionUsed?: boolean | null;
  createdAt?: Date | string | null;
};

const toIsoString = (value: Date | string | null | undefined) => {
  if (!value) return undefined;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
};

export function applyUserStateToToken(token: JWT, user: AuthUserState) {
  if (user.id) token.id = user.id;
  if (user.role) token.role = user.role;
  if (user.subscriptionPlan) token.subscriptionPlan = user.subscriptionPlan as "FREE" | "PREMIUM" | "PRO";
  if (typeof user.tokensRemaining === "number") {
    token.tokensRemaining = user.tokensRemaining;
  }
  token.isEmailVerified = Boolean(
    user.isEmailVerified || user.emailVerifiedBool || user.emailVerified
  );
  token.unverifiedTranscriptionUsed = Boolean(user.unverifiedTranscriptionUsed);
  const createdAt = toIsoString(user.createdAt);
  if (createdAt) token.createdAt = createdAt;
  token.accountSyncedAt = Date.now();
  return token;
}

export function applyTokenToSession(
  session: Session,
  token: JWT,
  credits?: CreditsSummary
) {
  if (!session.user) return session;
  session.user.id = token.id || session.user.id;
  session.user.role = token.role || "FREE";
  session.user.subscriptionPlan = token.subscriptionPlan || "FREE";
  session.user.tokensRemaining =
    typeof token.tokensRemaining === "number" ? token.tokensRemaining : 0;
  session.user.isEmailVerified = Boolean(token.isEmailVerified);
  session.user.unverifiedTranscriptionUsed = Boolean(token.unverifiedTranscriptionUsed);
  if (token.createdAt) session.user.createdAt = token.createdAt;
  if (typeof token.accountSyncedAt === "number") {
    session.user.accountSyncedAt = token.accountSyncedAt;
  }
  if (credits) {
    session.user.monthlyCreditsUsed = credits.used;
    session.user.monthlyCreditsLimit = credits.limit;
    session.user.monthlyCreditsRemaining = credits.remaining;
    session.user.monthlyCreditsResetAt = credits.resetAt;
    session.user.monthlyCreditsUnlimited = credits.unlimited;
    session.user.tokensRemaining = credits.remaining;
  }
  return session;
}
