import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import type { CreditsSummary } from "./credits";
import { creditTopUpsEnabled, monthlyCreditGrant } from "./creditTopUpPricing";

type User = {
  id: string;
  role: string;
  subscriptionPlan: string;
  tokensRemaining: number;
};
type Tx = Prisma.TransactionClient;
/** Locks the SAME row that the backend atomically debits. Never sync an old
 * frontend snapshot over this wallet; refunds and top-ups can arrive anytime. */
export async function lockCreditWallet(
  tx: Tx,
  user: User,
  seed: number,
  now = new Date(),
) {
  const month = now.toISOString().slice(0, 7);
  await tx.$executeRaw`INSERT INTO user_credits ("userId",credits,"createdAt","updatedAt") VALUES (${user.id},${seed},${now},${now}) ON CONFLICT("userId") DO NOTHING`;
  const [row] = await tx.$queryRaw<
    Array<{ credits: number; updatedAt: Date }>
  >`SELECT credits,"updatedAt" FROM user_credits WHERE "userId"=${user.id} FOR UPDATE`;
  const state = await tx.creditWalletState.findUnique({
    where: { userId: user.id },
  });
  let balance = row.credits;
  const free = user.role === "FREE" && user.subscriptionPlan === "FREE";
  if (
    free &&
    (state
      ? state.freeMonth !== month
      : row.updatedAt < new Date(month + "-01T00:00:00Z"))
  ) {
    balance = Math.max(balance, 10);
    await tx.$executeRaw`UPDATE user_credits SET credits=${balance},"updatedAt"=${now} WHERE "userId"=${user.id}`;
  }
  if (!state || state.freeMonth !== month)
    await tx.creditWalletState.upsert({
      where: { userId: user.id },
      create: { userId: user.id, freeMonth: month },
      update: { freeMonth: month },
    });
  return balance;
}
export async function walletCredits(user: User, computed: CreditsSummary) {
  return prisma.$transaction(async (tx) => {
    const remaining = await lockCreditWallet(tx, user, computed.remaining);
    await tx.user.update({
      where: { id: user.id },
      data: { tokensRemaining: remaining },
    });
    return {
      ...computed,
      remaining,
      limit: Math.max(computed.limit, computed.used + remaining),
    };
  });
}
export async function grantWalletAllowance(
  tx: Tx,
  user: User,
  grant: number,
  cap: number,
  seed = user.tokensRemaining,
  minimum = 0,
) {
  const current = await lockCreditWallet(tx, user, seed);
  const balance = Math.max(minimum, monthlyCreditGrant(current, grant, cap));
  await tx.$executeRaw`UPDATE user_credits SET credits=${balance},"updatedAt"=NOW() WHERE "userId"=${user.id}`;
  return balance;
}

/** Sale switches may be disabled; existing wallets must never return to the old capped sync. */
export async function usesCreditWallet(userId: string) {
  return (
    creditTopUpsEnabled() ||
    Boolean(
      await prisma.creditWalletState.findUnique({
        where: { userId },
        select: { userId: true },
      }),
    )
  );
}

/** Both the Stripe webhook and checkout-return confirmation use this lock. */
export async function activateWalletPlan(
  user: User,
  plan: "PREMIUM" | "PRO",
  grant: number,
  cap: number,
) {
  return prisma.$transaction(async (tx) => {
    await lockCreditWallet(tx, user, user.tokensRemaining);
    const current = await tx.user.findUniqueOrThrow({ where: { id: user.id } });
    const alreadyPaid =
      current.role === "PREMIUM" &&
      ["PREMIUM", "PRO"].includes(current.subscriptionPlan);
    const minimum =
      alreadyPaid && plan === "PRO" && current.subscriptionPlan !== "PRO"
        ? grant
        : 0;
    const balance = await grantWalletAllowance(
      tx,
      current,
      alreadyPaid ? 0 : grant,
      cap,
      current.tokensRemaining,
      minimum,
    );
    await tx.user.update({
      where: { id: user.id },
      data: {
        role: "PREMIUM",
        subscriptionPlan: plan,
        tokensRemaining: balance,
      },
    });
    return balance;
  });
}
