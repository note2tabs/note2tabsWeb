import { prisma } from "../prisma";
import { stablePostHogEventUuid } from "../posthogServer";
import type { NormalizedIngestEvent } from "../analyticsV2/schemas";
import { ENGAGEMENT_EVENTS, buildEngagementSnapshot, evaluateEngagement, type EngagementEvent, type DecisionContext, DAY } from "./policy";

export function engagementCollectionEnabled() { return process.env.ENGAGEMENT_SIGNALS_ENABLED === "true"; }
function text(value: unknown) { return typeof value === "string" && /^[a-z0-9_:-]{1,160}$/i.test(value) ? value : undefined; }
export function toEngagementEvent(e: NormalizedIngestEvent): EngagementEvent {
  return { id: stablePostHogEventUuid(e.eventId), at: e.ts.getTime(), name: e.name,
    project: text(e.editorId), job: text(e.jobId), session: text(e.sessionId),
    contentLocale: text(e.props.content_locale), source: text(e.props.source), reason: text(e.props.blocked_reason ?? e.props.reason), action: text(e.props.action) };
}
/** Consent is checked by ingest before this call. No names, files, or raw URLs stored. */
export async function recordEngagementEvents(accountId: string, events: NormalizedIngestEvent[]) {
  if (!engagementCollectionEnabled()) return;
  const now = Date.now();
  const selected = events.filter(e => ENGAGEMENT_EVENTS.has(e.name) && e.ts.getTime() <= now + 60_000 && e.ts.getTime() >= now - 30 * DAY);
  if (!selected.length) return;
  // Unsubscribe and paid status must be read from operational state at dispatch.
  await prisma.$transaction(selected.map(event => {
    const payload = toEngagementEvent(event);
    return prisma.$executeRaw`INSERT INTO "EngagementSignal" ("id", "accountId", "at", "payload")
      VALUES (${payload.id}, ${accountId}, ${event.ts}, ${JSON.stringify(payload)}::jsonb)
      ON CONFLICT ("id") DO NOTHING`;
  }));
}

export async function decideForAccount(accountId: string, context: DecisionContext, at = Date.now()) {
  const rows = await prisma.$queryRaw<Array<{ payload: EngagementEvent }>>`
    SELECT "payload" FROM "EngagementSignal" WHERE "accountId" = ${accountId}
      AND "at" >= ${new Date(at - 30 * DAY)} AND "at" < ${new Date(at)}
    ORDER BY "at" DESC, "id" DESC LIMIT 2001`;
  const snapshot = buildEngagementSnapshot(rows.slice(0, 2000).map(r => r.payload), at, rows.length <= 2000);
  const decision = evaluateEngagement(snapshot, context);
  // This is a recommendation for research, NOT authorization to send. Missing
  // marketing permission remains a hard gate on the actual decision above.
  const behavioralRecommendation = context.channel === "email"
    ? evaluateEngagement(snapshot, { ...context, marketingPermission: true, emailVerified: true })
    : decision;
  // One audit snapshot per account/channel/hour. Re-evaluate current conditions
  // every request, but avoid writing one record for every click or heartbeat.
  const id = `${accountId}:${context.channel}:${Math.floor(at / 3_600_000)}:${decision.version}:${decision.action}:${decision.reasons[0]}`;
  await prisma.$executeRaw`INSERT INTO "EngagementDecision" ("id", "accountId", "at", "channel", "payload")
    VALUES (${id}, ${accountId}, ${new Date(at)}, ${context.channel}, ${JSON.stringify({ snapshot, context, decision, behavioralRecommendation, mode: "shadow" })}::jsonb)
    ON CONFLICT ("id") DO NOTHING`;
  return { snapshot, decision, behavioralRecommendation };
}

export async function purgeEngagementForAccount(accountId: string) {
  if (!engagementCollectionEnabled()) return;
  await prisma.$transaction([
    prisma.$executeRaw`DELETE FROM "EngagementSignal" WHERE "accountId" = ${accountId}`,
    prisma.$executeRaw`DELETE FROM "EngagementDecision" WHERE "accountId" = ${accountId}`,
  ]);
}
