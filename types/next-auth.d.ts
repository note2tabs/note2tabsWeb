import NextAuth, { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user?: DefaultSession["user"] & {
      id: string;
      role?: string;
      tokensRemaining?: number;
      monthlyCreditsUsed?: number;
      monthlyCreditsLimit?: number;
      monthlyCreditsRemaining?: number;
      monthlyCreditsResetAt?: string;
      monthlyCreditsUnlimited?: boolean;
    };
  }

  interface User {
    role?: string;
    tokensRemaining?: number;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    role?: string;
    tokensRemaining?: number;
  }
}
