import { createHash } from "node:crypto";
import { prisma } from "../prisma";
import { createPostHogServerClient, createPostHogIngestClient, stablePostHogEventUuid } from "../posthogServer";
import { DAY } from "./policy";

import { ENGAGEMENT_EXPERIMENT, ENGAGEMENT_EXPERIMENT_ARMS, type EngagementArm } from "./experimentConfig";
export { ENGAGEMENT_EXPERIMENT, ENGAGEMENT_EXPERIMENT_ARMS };
export type { EngagementArm };
export type Enrollment = { accountId: string; version: string; arm: EngagementArm; enrolledAt: Date };
export function experimentEnabled() { return process.env.ENGAGEMENT_EXPERIMENT_ENABLED === "true" && process.env.ENGAGEMENT_SIGNALS_ENABLED === "true" && process.env.NEXT_PUBLIC_ENGAGEMENT_EXPERIMENT_ENABLED === "true"; }
/** Server-only, exact account allowlist for production QA before public launch. */
export function engagementQaAccount(accountId: string) {
  return !experimentEnabled() && process.env.ENGAGEMENT_SIGNALS_ENABLED === "true"
    && process.env.NEXT_PUBLIC_ENGAGEMENT_EXPERIMENT_ENABLED === "true"
    && (process.env.ENGAGEMENT_QA_ACCOUNT_IDS || "").split(",").map(id => id.trim()).filter(Boolean).includes(accountId);
}
export function engagementQaConfigured() { return Boolean(process.env.ENGAGEMENT_QA_ACCOUNT_IDS?.trim()); }
export function assignEngagementArm(accountId: string): EngagementArm {
  const bucket = createHash("sha256").update(`${ENGAGEMENT_EXPERIMENT}:${accountId}`).digest().readUInt32BE(0) % 100;
  return bucket < 34 ? "control" : bucket < 67 ? "existing" : "contextual";
}
export function experimentProperties(arm: EngagementArm) {
  return { engagement_experiment: ENGAGEMENT_EXPERIMENT, engagement_arm: arm,
    [`$feature/${ENGAGEMENT_EXPERIMENT}`]: arm, engagement_cta_timing: "playback_pause_1200ms" };
}
export async function getEngagementEnrollment(accountId: string): Promise<Enrollment> {
  const qa = engagementQaAccount(accountId);
  // The native flag is the launch/stop gate. Its SDK bucket is deliberately
  // not used for assignment: custom exposure + persisted application bucket
  // are authoritative, as supported by PostHog's external-assignment workflow.
  if (!qa) {
    const gateClient = createPostHogServerClient();
    const gate = await gateClient?.getFeatureFlag(ENGAGEMENT_EXPERIMENT, accountId, { sendFeatureFlagEvents: false });
    if (!ENGAGEMENT_EXPERIMENT_ARMS.includes(gate as EngagementArm)) throw new Error("Engagement experiment is not active");
  }
  // Assignment is persisted before any send/display. Hash does not include tab,
  // browser, campaign, checkpoint or channel. No nested campaign randomization.
  const arm = assignEngagementArm(accountId);
  const version = qa ? `${ENGAGEMENT_EXPERIMENT}-qa` : ENGAGEMENT_EXPERIMENT;
  const inserted = await prisma.$queryRaw<Enrollment[]>`INSERT INTO "EngagementEnrollment" ("accountId", "version", "arm", "enrolledAt")
    VALUES (${accountId}, ${version}, ${arm}, NOW())
    ON CONFLICT ("accountId", "version") DO UPDATE SET "accountId" = EXCLUDED."accountId"
    RETURNING "accountId", "version", "arm", "enrolledAt"`;
  const enrollment = inserted[0];
  if (!enrollment || !ENGAGEMENT_EXPERIMENT_ARMS.includes(enrollment.arm)) throw new Error("Invalid engagement assignment");
  // QA has a separate persisted version and never emits a real experiment exposure.
  if (qa) return enrollment;
  const ph = createPostHogIngestClient();
  if (!ph) throw new Error("Experiment analytics unavailable");
  // Exact original time + stable UUID make retries safe. Emitted for ALL arms,
  // including users for whom contextual rules deliberately choose no action.
  ph.capture({ distinctId: accountId, event: "engagement_policy_assigned",
    uuid: stablePostHogEventUuid(`${ENGAGEMENT_EXPERIMENT}:${accountId}:assignment`),
    timestamp: enrollment.enrolledAt, disableGeoip: true, properties: { ...experimentProperties(enrollment.arm), environment: process.env.VERCEL_ENV || process.env.NODE_ENV || "development" } });
  await ph.flush();
  return enrollment;
}
export async function reserveEngagementContact(enrollment: Enrollment, channel: "email" | "premium", action: string) {
  if (enrollment.arm === "control") return null;
  return prisma.$transaction(async tx => {
    // Serializes different campaigns/devices. Use a rolling, cross-campaign cap.
    // Keep the lock in this transaction; Prisma cannot deserialize its void result.
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${enrollment.accountId}, 0))::text`;
    const recent = await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "EngagementContact"
      WHERE "accountId" = ${enrollment.accountId} AND "channel" = ${channel} AND "createdAt" > ${new Date(Date.now() - 7 * DAY)}
      UNION ALL SELECT token AS id FROM "VerificationToken" WHERE ${channel} = 'email' AND (
        (identifier = ${`reminder:return-to-tab-cooldown:${enrollment.accountId}`} AND expires > NOW()) OR
        (identifier = ${`reminder:inactive-transcriber:${enrollment.accountId}`} AND expires > ${new Date(Date.now() + (3650 - 7) * DAY)})) LIMIT 1`;
    if (recent.length) return null;
    const id = globalThis.crypto.randomUUID();
    await tx.$executeRaw`INSERT INTO "EngagementContact" ("id", "accountId", "version", "arm", "channel", "action", "state", "createdAt")
      VALUES (${id}, ${enrollment.accountId}, ${enrollment.version}, ${enrollment.arm}, ${channel}, ${action}, 'reserved', NOW())`;
    return id;
  });
}
export async function finishEngagementContact(accountId: string, id: string, state: "visible" | "accepted" | "failed" | "cancelled" | "uncertain") {
  await prisma.$executeRaw`UPDATE "EngagementContact" SET "state" = ${state}
    WHERE "id" = ${id} AND "accountId" = ${accountId} AND "state" = 'reserved'`;
  const ph = createPostHogServerClient();
  ph?.capture({ distinctId: accountId, event: "engagement_contact_outcome", properties: { engagement_experiment: ENGAGEMENT_EXPERIMENT, contact_id: id, state }, uuid: stablePostHogEventUuid(`${id}:${state}`) });
  if (ph) await ph.flush().catch(() => { console.warn("engagement_outcome_delivery_failed"); });
}

export async function recordExperimentDecision(enrollment: Enrollment, channel: "email" | "premium", checkpoint: string, selected: boolean, details: Record<string, unknown> = {}) {
  const at = new Date();
  const id = `${enrollment.version}:${enrollment.accountId}:${channel}:${checkpoint}:${Math.floor(at.getTime() / 3600000)}:${selected}`;
  await prisma.$executeRaw`INSERT INTO "EngagementDecision" ("id", "accountId", "at", "channel", "payload")
    VALUES (${id}, ${enrollment.accountId}, ${at}, ${channel}, ${JSON.stringify({ mode: "experiment", version: enrollment.version, arm: enrollment.arm, checkpoint, selected, ...details })}::jsonb)
    ON CONFLICT ("id") DO NOTHING`;
}
