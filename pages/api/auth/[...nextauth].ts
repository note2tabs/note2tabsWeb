import NextAuth, { type NextAuthOptions } from "next-auth";
import type { Provider } from "next-auth/providers";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { prisma } from "../../../lib/prisma";

const providers: Provider[] = [
  CredentialsProvider({
    name: "Credentials",
    credentials: {
      email: { label: "Email", type: "email" },
      password: { label: "Password", type: "password" },
    },
    async authorize(credentials) {
      if (!credentials?.email || !credentials?.password) return null;
      const user = await prisma.user.findUnique({
        where: { email: credentials.email.toLowerCase() },
      });
      if (!user?.passwordHash) return null;
      const isValid = await compare(credentials.password, user.passwordHash);
      if (!isValid) return null;
      return {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        tokensRemaining: user.tokensRemaining,
      };
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
    async jwt({ token, user, account }) {
      // On initial sign in, persist DB identifiers into the JWT.
      if (user) {
        token.id = (user as any).id;
        token.role = (user as any).role;
        token.tokensRemaining = (user as any).tokensRemaining;
      }

      // For OAuth logins, fetch the user to sync role/tokens.
      if (!user && account && token.email) {
        const dbUser = await prisma.user.findUnique({ where: { email: token.email.toString() } });
        if (dbUser) {
          token.id = dbUser.id;
          token.role = dbUser.role;
          token.tokensRemaining = dbUser.tokensRemaining;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (!session.user || !token?.email) return session;
      // Fetch latest user data to keep tokens/role in sync.
      const dbUser = await prisma.user.findUnique({ where: { email: token.email.toString() } });
      if (dbUser) {
        session.user.id = dbUser.id;
        session.user.role = dbUser.role;
        session.user.tokensRemaining = dbUser.tokensRemaining;
      } else {
        session.user.id = token.id as string;
        session.user.role = (token.role as string) || "FREE";
        session.user.tokensRemaining = (token.tokensRemaining as number) ?? 0;
      }
      return session;
    },
  },
  pages: {
    signIn: "/auth/login",
  },
};

export default NextAuth(authOptions);
