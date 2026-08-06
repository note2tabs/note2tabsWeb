import type { Session } from "next-auth";
import { prisma } from "./prisma";

export async function getFreshUserRole(session?: Session | null) {
  const userId = session?.user?.id;
  if (!userId) return null;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  return user?.role || null;
}

export async function hasFreshUserRole(
  session: Session | null | undefined,
  allowedRoles: ReadonlySet<string>
) {
  const role = await getFreshUserRole(session);
  return Boolean(role && allowedRoles.has(role));
}
