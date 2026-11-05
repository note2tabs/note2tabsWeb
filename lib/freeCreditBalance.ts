import { prisma } from "./prisma";
import type { CreditsSummary } from "./credits";

/** Backend consumption is authoritative. Saved results are not a charge ledger. */
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
