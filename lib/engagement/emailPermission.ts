import {prisma} from "../prisma";
import {reminderUnsubscribeIdentifier} from "../reminderUnsubscribe";

export async function setReminderEmailPermission(accountId: string, allowed: boolean, basis: "settings_explicit_v1" | "unsubscribe_link_v1") {
  await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${accountId}, 0))`;
    await tx.$executeRaw`INSERT INTO "EngagementEmailPermission" ("accountId", allowed, basis, "recordedAt")
      VALUES (${accountId}, ${allowed}, ${basis}, NOW()) ON CONFLICT ("accountId")
      DO UPDATE SET allowed = EXCLUDED.allowed, basis = EXCLUDED.basis, "recordedAt" = EXCLUDED."recordedAt"`;
    const identifier = reminderUnsubscribeIdentifier(accountId);
    if (allowed) {
      // Explicit re-subscription can clear an unsubscribe, never a bounce/complaint suppression.
      await tx.$executeRaw`DELETE FROM "VerificationToken" WHERE identifier = ${identifier}`;
    } else {
      await tx.$executeRaw`INSERT INTO "VerificationToken" (identifier, token, expires)
        VALUES (${identifier}, ${`reminder-unsubscribed:${accountId}`}, ${new Date("9999-12-31T00:00:00Z")})
        ON CONFLICT (identifier, token) DO UPDATE SET expires = EXCLUDED.expires`;
    }
  });
}
