import { prisma } from "./prisma";
import type { CreditsSummary } from "./credits";

/** Display the authoritative balance without granting/resetting credits or taking write locks. */
export async function readFreeCreditBalance(userId: string, credits: CreditsSummary, windowStart: Date, db: Pick<typeof prisma, "$queryRaw"> = prisma): Promise<CreditsSummary> {
  const rows = await db.$queryRaw<Array<{ remaining: number }>>`
    SELECT CASE
      WHEN b."updatedAt" < ${windowStart} THEN 10
      WHEN b."userId" IS NULL THEN LEAST(10, GREATEST(0, u."tokensRemaining"))
      ELSE b.credits
    END AS remaining
    FROM "User" u LEFT JOIN user_credits b ON b."userId"=u.id
    WHERE u.id=${userId} AND u.role='FREE' AND u."subscriptionPlan"='FREE'
  `;
  if (rows.length !== 1) throw new Error("Account changed while reading credits");
  const remaining = Math.max(0, rows[0].remaining);
  return { ...credits, remaining, used: Math.max(0, credits.limit - remaining) };
}

/** Submission-only initialization/reset. Never call this from balance displays.
 * Backend consumption is authoritative. Saved results are not a charge ledger. */
export async function refreshFreeCreditBalance(userId: string, credits: CreditsSummary, windowStart: Date): Promise<CreditsSummary> {
  const rows = await prisma.$queryRaw<Array<{ remaining: number }>>`
    WITH account AS (
      SELECT id, "tokensRemaining" FROM "User"
      WHERE id=${userId} AND role='FREE' AND "subscriptionPlan"='FREE' FOR UPDATE
    ), balance AS (
      INSERT INTO user_credits ("userId", credits, "createdAt", "updatedAt")
      SELECT id, LEAST(10, GREATEST(0, LEAST("tokensRemaining", ${credits.remaining}))), NOW(), NOW() FROM account
      ON CONFLICT ("userId") DO UPDATE SET
        credits=CASE WHEN user_credits."updatedAt"<${windowStart} THEN 10 ELSE user_credits.credits END,
        "updatedAt"=CASE WHEN user_credits."updatedAt"<${windowStart} THEN NOW() ELSE user_credits."updatedAt" END
      RETURNING "userId", credits
    )
    UPDATE "User" u SET "tokensRemaining"=b.credits,
      "updatedAt"=CASE WHEN u."tokensRemaining"<>b.credits THEN NOW() ELSE u."updatedAt" END
    FROM balance b WHERE u.id=b."userId" RETURNING b.credits AS remaining
  `;
  if (rows.length !== 1) throw new Error("Account changed while refreshing credits");
  const remaining = Math.max(0, rows[0].remaining);
  return { ...credits, remaining, used: Math.max(0, credits.limit - remaining) };
}
