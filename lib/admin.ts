import type { Session } from "next-auth";

export const isAdminRole = (role?: string | null) => role === "ADMIN";

export const isAdminSession = (session?: Session | null) =>
  Boolean(session?.user && isAdminRole(session.user.role));
