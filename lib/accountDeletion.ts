import { randomUUID } from "node:crypto";
import { prisma } from "./prisma";

/** Commit an anonymous completion receipt atomically with account removal.
 * Delivery retries reuse this UUID; no deleted-account identity is retained. */
export async function deleteAccountAndRecordCompletion(userId: string) {
  const uuid = randomUUID();
  const payload = {
    uuid,
    event: "account_deleted",
    distinct_id: "system:account-deletions",
    timestamp: new Date().toISOString(),
    properties: {
      $process_person_profile: false,
      $geoip_disable: true,
      event_source: "account_deletion_server",
      schema_version: 1,
      environment: process.env.VERCEL_ENV || process.env.NODE_ENV || "development",
    },
  };
  await prisma.$transaction(async tx => {
    await tx.$executeRaw`DELETE FROM "AnalyticsDeliveryOutbox" WHERE "payload"->>'distinct_id' = ${userId}`;
    await tx.tabJob.deleteMany({ where: { userId } });
    await tx.canvases.deleteMany({ where: { user_id: userId } });
    await tx.account.deleteMany({ where: { userId } });
    await tx.session.deleteMany({ where: { userId } });
    // A concurrent/retried deletion cannot create a second completion receipt:
    // delete throws if the account is gone, rolling back this transaction.
    await tx.user.delete({ where: { id: userId } });
    await tx.$executeRaw`INSERT INTO "AnalyticsDeliveryOutbox" ("id", "payload") VALUES (${uuid}, ${JSON.stringify(payload)}::jsonb)`;
  });
}
