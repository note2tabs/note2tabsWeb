import NextAuth, { type NextAuthOptions } from "next-auth";
import type { Provider } from "next-auth/providers";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { prisma } from "../../../lib/prisma";
import { buildCreditsSummary, getCreditWindow } from "../../../lib/credits";

const providers: Provider[] = [
  CredentialsProvider({
    name: "Credentials",
    credentials: {
      email: { label: "Email", type: "email" },
      password: { label: "Password", type: "password" },
    },
    async authorize(credentials) {
      try {
        if (!credentials?.email || !credentials?.password) return null;
        const user = await prisma.user.findUnique({
          where: { email: credentials.email.toLowerCase() },
        });
        if (!user?.passwordHash) return null;
        const isValid = await compare(credentials.password, user.passwordHash);
        if (!isValid) return null;
        const isEmailVerified = Boolean((user as any).emailVerifiedBool || user.emailVerified);
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          tokensRemaining: user.tokensRemaining,
          isEmailVerified,
        };
      } catch (error) {
        console.error("Credentials authorize failed", error);
        return null;
      }
    },
  }),
];

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  providers.push(
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    })
  );
}

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  session: {
    strategy: "jwt",
  },
  secret: process.env.NEXTAUTH_SECRET,
  providers,
  callbacks: {
    async redirect({ baseUrl }) {
      return baseUrl;
    },
    async signIn({ user, account }) {
      if (account?.provider && account.provider !== "credentials" && user?.email) {
        try {
          await prisma.user.updateMany({
            where: { email: user.email.toLowerCase() },
            data: {
              emailVerified: new Date(),
              ...( { emailVerifiedBool: true } as any),
            } as any,
          });
        } catch (error) {
          console.error("Failed to mark OAuth user as verified", error);
        }
      }
      return true;
    },
    async jwt({ token, user, account }) {
      // On initial sign in, persist DB identifiers into the JWT.
      if (user) {
        token.id = (user as any).id;
        token.role = (user as any).role;
        token.tokensRemaining = (user as any).tokensRemaining;
        token.isEmailVerified = Boolean((user as any).isEmailVerified);
      }

      // For OAuth logins, fetch the user to sync role/tokens.
      if (!user && account && token.email) {
        try {
          const dbUser = await prisma.user.findUnique({ where: { email: token.email.toString() } });
          if (dbUser) {
            token.id = dbUser.id;
            token.role = dbUser.role;
            token.tokensRemaining = dbUser.tokensRemaining;
            token.isEmailVerified = Boolean((dbUser as any).emailVerifiedBool || dbUser.emailVerified);
          }
        } catch (error) {
          console.error("JWT callback user sync failed", error);
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (!session.user || !token?.email) return session;
      // Fetch latest user data to keep tokens/role in sync.
      let dbUser: Awaited<ReturnType<typeof prisma.user.findUnique>> | null = null;
      try {
        dbUser = await prisma.user.findUnique({ where: { email: token.email.toString() } });
      } catch (error) {
        console.error("Session callback user lookup failed", error);
      }
      if (dbUser) {
        session.user.id = dbUser.id;
        session.user.role = dbUser.role;
        session.user.tokensRemaining = dbUser.tokensRemaining;
        const isEmailVerified = Boolean((dbUser as any).emailVerifiedBool || dbUser.emailVerified);
        session.user.isEmailVerified = isEmailVerified;
        if (isEmailVerified && !(dbUser as any).emailVerifiedBool) {
          try {
            await prisma.user.update({
              where: { id: dbUser.id },
              data: { ...( { emailVerifiedBool: true } as any) } as any,
            });
          } catch (error) {
            console.error("Session callback emailVerifiedBool backfill failed", error);
          }
        }
      } else {
        session.user.id = token.id as string;
        session.user.role = (token.role as string) || "FREE";
        session.user.tokensRemaining = (token.tokensRemaining as number) ?? 0;
        session.user.isEmailVerified = Boolean(token.isEmailVerified);
      }
      const creditUserId = session.user.id;
      if (creditUserId) {
        try {
          const creditWindow = getCreditWindow({ userCreatedAt: dbUser?.createdAt });
          const isPremium =
            session.user.role === "PREMIUM" ||
            session.user.role === "ADMIN" ||
            session.user.role === "MODERATOR" ||
            session.user.role === "MOD";
          const creditJobs = await prisma.tabJob.findMany({
            where: isPremium
              ? { userId: creditUserId }
              : {
                  userId: creditUserId,
                  createdAt: {
                    gte: creditWindow.start,
                    lt: creditWindow.resetAt,
                  },
                },
            select: { durationSec: true },
          });
          const credits = buildCreditsSummary({
            durations: creditJobs.map((job) => job.durationSec),
            resetAt: creditWindow.resetAt,
            isPremium,
            userCreatedAt: dbUser?.createdAt,
          });
          session.user.monthlyCreditsUsed = credits.used;
          session.user.monthlyCreditsLimit = credits.limit;
          session.user.monthlyCreditsRemaining = credits.remaining;
          session.user.monthlyCreditsResetAt = credits.resetAt;
          session.user.monthlyCreditsUnlimited = credits.unlimited;
        } catch (error) {
          console.error("Session callback credits sync failed", error);
        }
      }
      return session;
    },
  },
  pages: {
    signIn: "/auth/login",
  },
};

export default NextAuth(authOptions);
