import NextAuth, { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user?: DefaultSession["user"] & {
      id: string;
      role?: string;
      tokensRemaining?: number;
      isEmailVerified?: boolean;
      unverifiedTranscriptionUsed?: boolean;
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
    tokensRemaining?: number;
    isEmailVerified?: boolean;
    unverifiedTranscriptionUsed?: boolean;
    createdAt?: Date | string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    role?: string;
    tokensRemaining?: number;
    isEmailVerified?: boolean;
    unverifiedTranscriptionUsed?: boolean;
    createdAt?: string;
    accountSyncedAt?: number;
  }
}
