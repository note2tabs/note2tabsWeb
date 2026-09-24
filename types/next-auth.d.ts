import NextAuth, { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user?: DefaultSession["user"] & {
      id: string;
      role?: string;
      subscriptionPlan?: "FREE" | "PREMIUM" | "PRO";
      tokensRemaining?: number;
      isEmailVerified?: boolean;
      unverifiedTranscriptionUsed?: boolean;
      heavyPreviewUsed?: boolean;
      monthlyCreditsUsed?: number;
      monthlyCreditsLimit?: number;
      monthlyCreditsRemaining?: number;
      monthlyCreditsResetAt?: string;
      monthlyCreditsUnlimited?: boolean;
      createdAt?: string;
      accountSyncedAt?: number;
    };
  }

  interface User {
    role?: string;
    subscriptionPlan?: "FREE" | "PREMIUM" | "PRO";
    tokensRemaining?: number;
    isEmailVerified?: boolean;
    unverifiedTranscriptionUsed?: boolean;
    heavyPreviewUsed?: boolean;
    createdAt?: Date | string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    role?: string;
    subscriptionPlan?: "FREE" | "PREMIUM" | "PRO";
    tokensRemaining?: number;
    isEmailVerified?: boolean;
    unverifiedTranscriptionUsed?: boolean;
    heavyPreviewUsed?: boolean;
    createdAt?: string;
    accountSyncedAt?: number;
  }
}
