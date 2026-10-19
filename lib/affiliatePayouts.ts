import { randomUUID } from "crypto";
import type Stripe from "stripe";
import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { AFFILIATE_BANK_PAYOUT_DAY, minimumPayoutMinor, settledCommissionAmount, type ReferenceRates } from "./affiliatePayoutPolicy";

export function withAffiliatePayoutLock<T>(affiliateId: string, run: (tx: Prisma.TransactionClient) => Promise<T>) {
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtext(${`affiliate-payout:${affiliateId}`}))`;
    return run(tx);
  }, { maxWait: 10000, timeout: 60000 });
}
export const payoutGroup = (id: string) => `affiliate_batch_${id}`;

/** Stripe can succeed before a DB commit fails. Reconcile by immutable group,
 * even after Stripe's 24-hour idempotency-key retention has elapsed. */
export async function reconcileAffiliatePayout(tx: Prisma.TransactionClient, stripe: Stripe, payout: {id: string; amount: number; currency: string}, accountId: string) {
  const transfers = await stripe.transfers.list({ transfer_group: payoutGroup(payout.id), limit: 2 });
  if (transfers.data.length > 1) throw new Error("Multiple transfers for affiliate payout");
  const transfer = transfers.data[0];
  if (!transfer) return null;
  const destination = typeof transfer.destination === "string" ? transfer.destination : transfer.destination?.id;
  if (transfer.amount !== payout.amount || transfer.currency !== payout.currency || destination !== accountId) throw new Error("Affiliate payout transfer mismatch");
  await recordTransferredPayout(tx, payout.id, transfer.id);
  return transfer;
}
async function recordTransferredPayout(tx: Prisma.TransactionClient, id: string, transferId: string) {
  const paidAt = new Date();
  await tx.affiliatePayout.update({ where: { id }, data: { status: "PAID", stripeTransferId: transferId, transferredAt: paidAt } });
  await tx.affiliateCommission.updateMany({ where: { payoutId: id, status: "PENDING" }, data: { status: "PAID", paidAt } });
}

export async function prepareAffiliatePayout(affiliateId: string, stripe: Stripe, rates: ReferenceRates, now: Date) {
  return withAffiliatePayoutLock(affiliateId, async tx => {
    const pending = await tx.affiliatePayout.findFirst({ where: { affiliateId, status: "PENDING" }, orderBy: { createdAt: "asc" } });
    if (pending) return pending;
    const month = now.toISOString().slice(0, 7); // Calendar months in UTC, like Stripe.
    const monthStart = new Date(month + "-01T00:00:00Z");
    if (await tx.affiliatePayout.findFirst({ where: { affiliateId, OR: [{ month }, { transferredAt: { gte: monthStart } }] } })) return null;
    // Honor payments made by the old per-invoice implementation this month.
    if (await tx.affiliateCommission.findFirst({ where: { affiliateId, paidAt: { gte: monthStart } } })) return null;
    const commissions = await tx.affiliateCommission.findMany({
      where: { affiliateId, status: "PENDING", payoutId: null, availableAt: { lte: now }, stripeChargeId: { not: null } },
      orderBy: { availableAt: "asc" },
    });
    if (!commissions.length) return null;
    let currency: string | undefined;
    const allocations: Array<{ id: string; amount: number }> = [];
    // Bound Stripe concurrency without truncating the balance used for eligibility.
    for (let offset = 0; offset < commissions.length; offset += 8) {
      const settled = await Promise.all(commissions.slice(offset, offset + 8).map(async commission => {
        const charge = await stripe.charges.retrieve(commission.stripeChargeId!, { expand: ["balance_transaction"] });
        const settlement = charge.balance_transaction;
        if (!settlement || typeof settlement === "string" || settlement.available_on * 1000 > now.getTime() || charge.refunded || charge.amount_refunded > 0 || charge.disputed) throw new Error("Commission settlement not ready");
        return { id: commission.id, amount: settledCommissionAmount(commission, charge, settlement), currency: settlement.currency };
      }));
      for (const item of settled) {
        if (currency && currency !== item.currency) throw new Error("Mixed settlement currencies require payout review");
        currency = item.currency;
        allocations.push({ id: item.id, amount: item.amount });
      }
    }
    const amount = allocations.reduce((sum, item) => sum + item.amount, 0);
    if (amount < minimumPayoutMinor(currency!, rates)) return null;
    const payout = await tx.affiliatePayout.create({ data: { id: randomUUID(), affiliateId, month, amount, currency: currency! } });
    for (const item of allocations) await tx.affiliateCommission.update({ where: { id: item.id }, data: { payoutId: payout.id, payoutAmount: item.amount } });
    return payout;
  });
}

export async function sendAffiliatePayout(id: string, affiliateId: string, accountId: string, stripe: Stripe) {
  return withAffiliatePayoutLock(affiliateId, async tx => {
    const payout = await tx.affiliatePayout.findUniqueOrThrow({ where: { id }, include: { commissions: true } });
    if (payout.status !== "PENDING") return false;
    if (await reconcileAffiliatePayout(tx, stripe, payout, accountId)) return true;
    if (payout.commissions.some(item => item.status !== "PENDING")) {
      await tx.affiliatePayout.update({ where: { id }, data: { status: "CANCELLED" } });
      await tx.affiliateCommission.updateMany({ where: { payoutId: id, status: "PENDING" }, data: { payoutId: null, payoutAmount: null } });
      return false;
    }
    const account = await stripe.accounts.retrieve(accountId);
    if ("deleted" in account || !account.payouts_enabled || !account.details_submitted) return false;
    // One bank payout date; all eligible commissions travel in one transfer.
    // A reserve/minimum balance would retain money, not define a payout trigger.
    await stripe.accounts.update(accountId, { settings: { payouts: { schedule: { interval: "monthly", monthly_anchor: AFFILIATE_BANK_PAYOUT_DAY } } } });
    const transfer = await stripe.transfers.create({
      amount: payout.amount, currency: payout.currency, destination: accountId,
      transfer_group: payoutGroup(id), metadata: { note2tabsAffiliateId: affiliateId, note2tabsPayoutId: id },
    }, { idempotencyKey: payoutGroup(id) });
    await recordTransferredPayout(tx, id, transfer.id);
    return true;
  });
}

/** Called under the same affiliate lock as payouts, so a refund cannot slip
 * between the batch validation and transfer. Reconcile both external effects. */
export async function reverseCommissionTransfer(tx: Prisma.TransactionClient, stripe: Stripe, commissionId: string) {
  let commission = await tx.affiliateCommission.findUnique({ where: { id: commissionId }, include: { payout: true, affiliate: true } });
  if (!commission || commission.status === "REVERSED") return null;
  if (commission.payout?.status === "PENDING" && commission.affiliate.stripeAccountId) {
    await reconcileAffiliatePayout(tx, stripe, commission.payout, commission.affiliate.stripeAccountId);
    commission = await tx.affiliateCommission.findUniqueOrThrow({ where: { id: commissionId }, include: { payout: true, affiliate: true } });
  }
  const transferId = commission.stripeTransferId || commission.payout?.stripeTransferId;
  const amount = commission.payoutId ? commission.payoutAmount : commission.commissionAmount;
  if (commission.status === "PAID") {
    if (!transferId || amount === null || amount < 0) throw new Error("Paid commission missing transfer allocation");
    if (amount > 0) {
      let alreadyReversed = false;
      for await (const reversal of stripe.transfers.listReversals(transferId, { limit: 100 })) {
        if (reversal.metadata?.note2tabsCommissionId === commission.id) {
          if (reversal.amount !== amount) throw new Error("Commission reversal amount mismatch");
          alreadyReversed = true;
          break;
        }
      }
      if (!alreadyReversed) await stripe.transfers.createReversal(transferId, {
        amount, metadata: { note2tabsCommissionId: commission.id },
      }, { idempotencyKey: `affiliate-reversal-${commission.id}` });
    }
  }
  const reversedAt = new Date();
  await tx.affiliateCommission.update({ where: { id: commission.id }, data: { status: "REVERSED", reversedAt } });
  return { reversedAt };
}
