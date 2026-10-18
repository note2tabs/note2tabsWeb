import { prisma } from "./prisma";
import type { Prisma } from "@prisma/client";
import { ENGAGEMENT_EXPERIMENT } from "./engagement/experimentConfig";

export function creditResetEmailsEnabled() {
  return process.env.CREDIT_RESET_EMAIL_ENABLED === "true";
}
export function freeResetWindow(now: Date) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  return {
    start,
    previous: new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1),
    ),
    expires: new Date(start.getTime() + 72 * 3600000),
  };
}
/** Called in the SAME transaction that grants paid renewal credits. */
export async function queuePaidCreditReset(
  tx: Prisma.TransactionClient,
  input: {
    accountId: string;
    invoiceId: string;
    previousBalance: number;
    now: Date;
  },
) {
  if (
    !creditResetEmailsEnabled() ||
    input.previousBalance < 0 ||
    input.previousBalance > 3
  )
    return;
  const expires = new Date(input.now.getTime() + 72 * 3600000);
  await tx.$executeRaw`INSERT INTO "CreditResetNotice" (id,"accountId",source,"availableAt","expiresAt")
 VALUES (${`paid:${input.invoiceId}`},${input.accountId},'paid',${input.now},${expires}) ON CONFLICT(id) DO NOTHING`;
}
/** Free entitlements refresh on the UTC calendar boundary. A backend balance
 * untouched since that boundary preserves the actual pre-reset balance. Users
 * who already resumed are intentionally not reminded. Never mutate credits. */
export async function collectFreeCreditResets(now: Date) {
  const w = freeResetWindow(now);
  if (now >= w.expires) return 0;
  return prisma.$executeRaw`INSERT INTO "CreditResetNotice" (id,"accountId",source,"availableAt","expiresAt")
 SELECT 'free:' || u.id || ':' || ${w.start.toISOString()}, u.id,'free',${w.start},${w.expires}
 FROM "User" u JOIN user_credits c ON c."userId"=u.id
 JOIN "EngagementEmailPermission" p ON p."accountId"=u.id AND p.allowed=TRUE
 WHERE u.role='FREE' AND u."subscriptionPlan"='FREE' AND c.credits BETWEEN 0 AND 3 AND c."updatedAt"<${w.start}
 AND (u."emailVerified" IS NOT NULL OR u."emailVerifiedBool"=TRUE)
 AND EXISTS(SELECT 1 FROM "TabJob" j WHERE j."userId"=u.id AND j."createdAt">=${w.previous} AND j."createdAt"<${w.start})
 AND NOT EXISTS(SELECT 1 FROM "TabJob" j WHERE j."userId"=u.id AND j."createdAt">=${w.start})
 ON CONFLICT(id) DO NOTHING`;
}
export type CreditResetCandidate = {
  id: string;
  accountId: string;
  email: string;
  source: string;
};
export async function creditResetCandidates(
  now: Date,
  id?: string,
  claimed = false,
) {
  return prisma.$queryRaw<
    CreditResetCandidate[]
  >`SELECT n.id,n."accountId",u.email,n.source FROM "CreditResetNotice" n
 JOIN "User" u ON u.id=n."accountId"
 JOIN "EngagementEmailPermission" p ON p."accountId"=u.id AND p.allowed=TRUE
 WHERE n.status=${claimed ? "sending" : "pending"} AND n."availableAt"<=${now} AND n."expiresAt">${now}
 AND (${id || null}::text IS NULL OR n.id=${id || null})
 AND (u."emailVerified" IS NOT NULL OR u."emailVerifiedBool"=TRUE)
 AND u.role NOT IN ('ADMIN','MOD','MODERATOR')
 AND ((n.source='paid' AND u.role='PREMIUM' AND u."tokensRemaining">3)
 OR (n.source='free' AND u.role='FREE' AND u."subscriptionPlan"='FREE'
 AND EXISTS(SELECT 1 FROM user_credits c WHERE c."userId"=u.id AND c.credits BETWEEN 0 AND 3 AND c."updatedAt"<n."availableAt")
 AND NOT EXISTS(SELECT 1 FROM "TabJob" j WHERE j."userId"=u.id AND j."createdAt">=n."availableAt")))
 AND NOT EXISTS(SELECT 1 FROM "VerificationToken" v WHERE v.expires>${now} AND v.identifier IN ('email:reminders-unsubscribed:'||u.id,'email:reminders-delivery-suppressed:'||u.id))
 AND NOT EXISTS(SELECT 1 FROM "EngagementEnrollment" e WHERE e."accountId"=u.id AND e.version=${ENGAGEMENT_EXPERIMENT})
 AND NOT EXISTS(SELECT 1 FROM "EngagementContact" e WHERE e."accountId"=u.id AND e.channel='email' AND e."createdAt">${new Date(now.getTime() - 7 * 86400000)})
 AND NOT EXISTS(SELECT 1 FROM "CreditResetNotice" sent WHERE sent."accountId"=u.id AND sent.status='accepted' AND sent."sentAt">${new Date(now.getTime() - 7 * 86400000)})
 ORDER BY n."availableAt",n.id LIMIT 50`;
}
// Atomic claim plus an immediate eligibility recheck prevent overlapping cron
// sends. Ambiguous provider errors are never automatically replayed.
export async function claimCreditReset(id: string) {
  return (
    (await prisma.$executeRaw`UPDATE "CreditResetNotice" SET status='sending' WHERE id=${id} AND status='pending'`) ===
    1
  );
}
export async function finishCreditReset(
  id: string,
  status: "accepted" | "ambiguous" | "cancelled",
  now: Date,
) {
  await prisma.$executeRaw`UPDATE "CreditResetNotice" SET status=${status},"sentAt"=${status === "accepted" ? now : null} WHERE id=${id} AND status='sending'`;
}
