import { waitUntil } from "@vercel/functions";
import { prisma } from "./prisma";
type Payload = Record<string, unknown> & { uuid: string };
type Delivery = (payloads: Payload[]) => Promise<void>;

/** Persist immutable identity, time AND properties before sending. Concurrent
 * retries may deliver the same payload, but never a newly timestamped copy. */
async function store(payloads: Payload[]) {
  const pending: Payload[] = [];
  for (const payload of payloads) {
    const rows = await prisma.$queryRaw<Array<{payload: Payload; deliveredAt: Date | null}>>`
      INSERT INTO "AnalyticsDeliveryOutbox" ("id", "payload")
      VALUES (${payload.uuid}, ${JSON.stringify(payload)}::jsonb)
      ON CONFLICT ("id") DO UPDATE SET "id" = EXCLUDED."id"
      RETURNING "payload", "deliveredAt"`;
    if (rows[0] && !rows[0].deliveredAt) pending.push(rows[0].payload);
  }
  return pending;
}
export async function persistPostHogCaptures(payloads: Payload[], send: Delivery) {
  await deliver(await store(payloads), send);
}
export async function enqueuePostHogCaptures(payloads: Payload[], send: Delivery) {
  const pending = await store(payloads);
  const delivery = deliver(pending, send).catch(() => { console.warn("posthog_business_delivery_pending"); });
  try { waitUntil(delivery); } catch { /* standalone/local execution */ }
}
async function deliver(payloads: Payload[], send: Delivery) {
  if (!payloads.length) return;
  // Send batches below PostHog's normal limits. A failed response or a failed
  // acknowledgement leaves rows pending; replay reuses the complete payload.
  await send(payloads);
  for (const payload of payloads) await prisma.$executeRaw`
    UPDATE "AnalyticsDeliveryOutbox" SET "deliveredAt" = NOW() WHERE "id" = ${payload.uuid} AND "deliveredAt" IS NULL`;
}
export async function retryPostHogCaptures(send: Delivery) {
  const rows = await prisma.$queryRaw<Array<{payload: Payload}>>`
    SELECT "payload" FROM "AnalyticsDeliveryOutbox" WHERE "deliveredAt" IS NULL ORDER BY "createdAt" ASC LIMIT 100`;
  await deliver(rows.map(row => row.payload), send);
  // Delivered identities remain long enough to deduplicate provider retries.
  // Bounded cleanup never deletes undelivered events.
  await prisma.$executeRaw`DELETE FROM "AnalyticsDeliveryOutbox" WHERE "id" IN (
    SELECT "id" FROM "AnalyticsDeliveryOutbox" WHERE "deliveredAt" < NOW() - INTERVAL '90 days' LIMIT 1000)`;
  return rows.length;
}

export async function deletePostHogCapturesForAccount(accountId: string) {
  await prisma.$executeRaw`DELETE FROM "AnalyticsDeliveryOutbox" WHERE "payload"->>'distinct_id' = ${accountId}`;
}
