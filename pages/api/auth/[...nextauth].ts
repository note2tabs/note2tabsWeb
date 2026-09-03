import NextAuth, { type NextAuthOptions } from "next-auth";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import { normalizeSubscriptionPlan } from "../../../lib/subscriptionPlans";
import { compare } from "bcryptjs";
import { prisma } from "../../../lib/prisma";
import { buildDevCreditsSummary } from "../../../lib/credits";
import { applyTokenToSession, applyUserStateToToken } from "../../../lib/authSession";
import { isLocalNoDbServerMode } from "../../../lib/serverDevMode";
import { parseCookieHeader } from "../../../lib/analyticsV2/cookies";
import { linkIdentityToUser } from "../../../lib/analyticsV2/identity";
import { getAuthSiteUrl } from "../../../lib/siteUrl";

process.env.NEXTAUTH_URL = getAuthSiteUrl();

async function restoreArchivedEditorsOnLogin(userId: string): Promise<void> {
  const baseUrl = process.env.BACKEND_API_BASE_URL;
  const backendSecret = process.env.BACKEND_SHARED_SECRET || process.env.NOTE2TABS_BACKEND_SECRET;
  if (!baseUrl || !backendSecret) return;
  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/api/v1/maintenance/editor-archive/restore-user`, {
      method: "POST",
      headers: {
        "X-Backend-Secret": backendSecret,
        "X-User-Id": userId,
      },
      signal: AbortSignal.timeout(25_000),
    });
    if (!response.ok) {
      console.error("Failed to restore archived editors on login", response.status);
    }
  } catch (error) {
    // Login should remain available if the archive service is temporarily down;
    // the editor endpoint still has a per-canvas restore fallback.
    console.error("Failed to restore archived editors on login", error);
  }
}

const providers: NextAuthOptions["providers"] = [
  CredentialsProvider({
    name: "Credentials",
    credentials: {
      email: { label: "Email", type: "email" },
      password: { label: "Password", type: "password" },
    },
    async authorize(credentials, req) {
      try {
        if (!credentials?.email || !credentials?.password) return null;
        const user = await prisma.user.findUnique({
          where: { email: credentials.email.toLowerCase() },
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            subscriptionPlan: true,
            tokensRemaining: true,
            passwordHash: true,
            emailVerified: true,
            emailVerifiedBool: true,
            unverifiedTranscriptionUsed: true,
            createdAt: true,
          },
        });
        if (!user?.passwordHash) return null;
        const isValid = await compare(credentials.password, user.passwordHash);
        if (!isValid) return null;
        const isEmailVerified = Boolean((user as any).emailVerifiedBool || user.emailVerified);

        try {
          const cookies = parseCookieHeader(req.headers?.cookie);
          const rawFingerprint =
            typeof req.body?.fingerprintId === "string" ? req.body.fingerprintId : undefined;
          await linkIdentityToUser({
            userId: user.id,
            source: "login",
            anonId: cookies.analytics_anon,
            sessionId: cookies.analytics_session,
            consent: cookies.analytics_consent,
            rawFingerprint,
            funnelId:
              typeof req.body?.funnelId === "string" ? req.body.funnelId : undefined,
            funnelSource:
              typeof req.body?.funnelSource === "string" ? req.body.funnelSource : undefined,
            funnelReason:
              typeof req.body?.funnelReason === "string" ? req.body.funnelReason : undefined,
          });
        } catch (linkError) {
          console.warn("credentials login identity link warning", linkError);
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          subscriptionPlan: normalizeSubscriptionPlan(user.subscriptionPlan),
          tokensRemaining: user.tokensRemaining,
          isEmailVerified,
          unverifiedTranscriptionUsed: user.unverifiedTranscriptionUsed,
          createdAt: user.createdAt,
        };
      } catch (error) {
        markPrismaUnavailable(error);
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
      allowDangerousEmailAccountLinking: true,
    })
  );
}

const allowDevAuthFallback = isLocalNoDbServerMode;
let devPrismaUnavailable = allowDevAuthFallback;

const shouldBypassPrismaSync = () => allowDevAuthFallback && devPrismaUnavailable;

const markPrismaUnavailable = (error: unknown) => {
  if (!allowDevAuthFallback) return;
  if (error instanceof Error) {
    devPrismaUnavailable = true;
  }
};

export const authOptions: NextAuthOptions = {
  adapter: allowDevAuthFallback ? undefined : PrismaAdapter(prisma),
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60,
  },
  secret: process.env.NEXTAUTH_SECRET,
  providers,
  callbacks: {
    async redirect({ url, baseUrl }) {
      if (url.startsWith("/")) return `${baseUrl}${url}`;
      try {
        const parsed = new URL(url);
        if (parsed.origin === baseUrl) return url;
      } catch {
        return baseUrl;
      }
      return baseUrl;
    },
    async signIn({ user, account }) {
      if (shouldBypassPrismaSync()) return true;
      if (user?.id) {
        try {
          const signedInAt = new Date();
          await prisma.user.updateMany({
            where: { id: user.id },
            data: {
              lastLoginAt: signedInAt,
              lastActiveAt: signedInAt,
            },
          });
          await restoreArchivedEditorsOnLogin(user.id);
        } catch (error) {
          markPrismaUnavailable(error);
          console.error("Failed to record user login", error);
        }
      }
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
          markPrismaUnavailable(error);
          console.error("Failed to mark OAuth user as verified", error);
        }
      }
      return true;
    },
    async jwt({ token, user, trigger }) {
      // Persist the account state once at sign-in. Routine session reads can
      // then restore immediately from the encrypted cookie without waking Neon.
      if (user) {
        applyUserStateToToken(token, user);
      }

      // useSession().update() is reserved for explicit account refreshes such
      // as checkout activation. It is intentionally the only post-login path
      // that synchronizes the JWT from the database.
      if (trigger === "update" && token.email && !shouldBypassPrismaSync()) {
        try {
          const dbUser = await prisma.user.findUnique({
            where: { email: token.email.toString() },
            select: {
              id: true,
              role: true,
              subscriptionPlan: true,
              tokensRemaining: true,
              emailVerified: true,
              emailVerifiedBool: true,
              unverifiedTranscriptionUsed: true,
              createdAt: true,
            },
          });
          if (dbUser) {
            applyUserStateToToken(token, dbUser);
          }
        } catch (error) {
          markPrismaUnavailable(error);
          console.error("JWT callback user sync failed", error);
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (!session.user || !token?.email) return session;
      if (shouldBypassPrismaSync()) {
        if (!token.id) token.id = session.user.id || "dev-guest";
        return applyTokenToSession(session, token, buildDevCreditsSummary());
      }
      return applyTokenToSession(session, token);
    },
  },
  pages: {
    signIn: "/auth/login",
  },
};

export default NextAuth(authOptions);
