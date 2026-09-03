import type { Session } from "next-auth";
import { prisma } from "./prisma";

export async function getFreshUserAccess(session?: Session | null) {
  const userId = session?.user?.id;
  if (!userId) return null;
  return prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, subscriptionPlan: true },
  });
}

export async function getFreshUserRole(session?: Session | null) {
  return (await getFreshUserAccess(session))?.role || null;
}

export async function hasFreshUserRole(
  session: Session | null | undefined,
  allowedRoles: ReadonlySet<string>
) {
  const role = await getFreshUserRole(session);
  return Boolean(role && allowedRoles.has(role));
}
