import { waitUntil } from "@vercel/functions";
import { prisma } from "./prisma";
type Payload = Record<string, unknown> & { uuid: string };
type Delivery = (payloads: Payload[]) => Promise<void>;

/** Persist immutable identity, time AND properties before sending. Concurrent
 * retries may deliver the same payload, but never a newly timestamped copy. */
async function store(payloads: Payload[]) {
  const pending: Payload[] = [];
  // Deduplicate within the batch before ON CONFLICT; the first immutable event
  // wins, just as sequential inserts did. Sort SQL input to avoid lock inversion.
  const byIdentity = new Map<string, Payload>();
  for (const payload of payloads) if (!byIdentity.has(payload.uuid)) byIdentity.set(payload.uuid, payload);
  const unique = [...byIdentity.values()];
  for (let index = 0; index < unique.length; index += 100) {
    const batch = unique.slice(index, index + 100);
    const rows = await prisma.$queryRaw<Array<{payload: Payload; deliveredAt: Date | null}>>`
      INSERT INTO "AnalyticsDeliveryOutbox" ("id", "payload")
      SELECT item->>'uuid', item FROM jsonb_array_elements(${JSON.stringify(batch)}::jsonb) AS item
      ORDER BY item->>'uuid'
      ON CONFLICT ("id") DO UPDATE SET "id" = EXCLUDED."id"
      RETURNING "payload", "deliveredAt"`;
    const byId = new Map(rows.map(row => [row.payload.uuid, row]));
    for (const payload of batch) {
      const row = byId.get(payload.uuid);
      if (!row) throw new Error("Analytics event persistence was not acknowledged");
      if (!row.deliveredAt) pending.push(row.payload);
    }
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
  for (let index = 0; index < payloads.length; index += 100) {
    const batch = payloads.slice(index, index + 100);
    await send(batch);
    await prisma.$executeRaw`
      UPDATE "AnalyticsDeliveryOutbox" SET "deliveredAt" = NOW()
      WHERE "id" IN (SELECT jsonb_array_elements_text(${JSON.stringify(batch.map(payload => payload.uuid))}::jsonb))
        AND "deliveredAt" IS NULL`;
  }
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
