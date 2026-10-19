import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  tx: {
    $queryRaw: vi.fn(),
    affiliatePayout: { findFirst: vi.fn(), create: vi.fn(), findUniqueOrThrow: vi.fn(), update: vi.fn() },
    affiliateCommission: { findFirst: vi.fn(), findUnique: vi.fn(), findUniqueOrThrow: vi.fn(), findMany: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  },
  transaction: vi.fn(),
  stripe: { charges: { retrieve: vi.fn() }, accounts: { retrieve: vi.fn(), update: vi.fn() }, transfers: { list: vi.fn(), create: vi.fn(), listReversals: vi.fn(), createReversal: vi.fn() } },
}));
vi.mock("../../lib/prisma", () => ({ prisma: { $transaction: m.transaction } }));
import { prepareAffiliatePayout, sendAffiliatePayout, reverseCommissionTransfer } from "../../lib/affiliatePayouts";
const now = new Date("2026-10-20T12:00:00Z");
const rates = { date: "2026-10-19", rates: { EUR: 1, USD: 1, SEK: 10 } };
const commission = (id: string, amount = 3000) => ({ id, stripeChargeId: `ch_${id}`, grossAmount: 15000, commissionAmount: amount, currency: "eur", status: "PENDING" });
const payout = { id: "batch", affiliateId: "aff", month: "2026-10", amount: 60000, currency: "sek", status: "PENDING", commissions: [{ id: "c1", status: "PENDING" }, { id: "c2", status: "PENDING" }] };
beforeEach(() => {
  vi.resetAllMocks();
  m.transaction.mockImplementation(fn => fn(m.tx));
  m.tx.affiliatePayout.create.mockImplementation(({data}) => ({ ...data, status: "PENDING" }));
  m.tx.affiliateCommission.findMany.mockResolvedValue([commission("c1"), commission("c2")]);
  m.stripe.charges.retrieve.mockResolvedValue({ amount: 15000, currency: "eur", balance_transaction: { currency: "sek", amount: 150000, available_on: 1 } });
  m.tx.affiliatePayout.findUniqueOrThrow.mockResolvedValue(payout);
  m.stripe.accounts.retrieve.mockResolvedValue({ id: "acct", payouts_enabled: true, details_submitted: true });
  m.stripe.transfers.list.mockResolvedValue({ data: [] });
  m.stripe.transfers.create.mockResolvedValue({ id: "tr_batch" });
});
describe("monthly affiliate payouts", () => {
  it("groups mature earnings, preserving settlement allocations for later refunds", async () => {
    const result = await prepareAffiliatePayout("aff", m.stripe as any, rates, now);
    expect(result).toEqual(expect.objectContaining({ amount: 60000, currency: "sek", month: "2026-10" }));
    expect(m.tx.affiliateCommission.update).toHaveBeenCalledWith(expect.objectContaining({ where: {id: "c1"}, data: { payoutId: result!.id, payoutAmount: 30000 } }));
    expect(m.tx.$queryRaw).toHaveBeenCalled();
  });
  it("carries below-threshold earnings forward without reserving or transferring them", async () => {
    m.tx.affiliateCommission.findMany.mockResolvedValue([commission("c1", 100)]);
    expect(await prepareAffiliatePayout("aff", m.stripe as any, rates, now)).toBeNull();
    expect(m.tx.affiliatePayout.create).not.toHaveBeenCalled();
    expect(m.tx.affiliateCommission.update).not.toHaveBeenCalled();
  });
  it("includes exactly the threshold", async () => {
    m.tx.affiliateCommission.findMany.mockResolvedValue([commission("c1", 5000)]);
    expect(await prepareAffiliatePayout("aff", m.stripe as any, rates, now)).toEqual(expect.objectContaining({ amount: 50000 }));
  });
  it("does not release another batch in the same month", async () => {
    m.tx.affiliatePayout.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ ...payout, status: "PAID" });
    expect(await prepareAffiliatePayout("aff", m.stripe as any, rates, now)).toBeNull();
    expect(m.stripe.charges.retrieve).not.toHaveBeenCalled();
  });
  it("honors old per-commission payments this month", async () => {
    m.tx.affiliateCommission.findFirst.mockResolvedValue({ id: "old" });
    expect(await prepareAffiliatePayout("aff", m.stripe as any, rates, now)).toBeNull();
  });
  it("retries the immutable pending batch rather than including new earnings", async () => {
    m.tx.affiliatePayout.findFirst.mockResolvedValueOnce(payout);
    expect(await prepareAffiliatePayout("aff", m.stripe as any, rates, now)).toBe(payout);
    expect(m.tx.affiliateCommission.findMany).not.toHaveBeenCalled();
  });
  it("allows the next calendar month", async () => {
    expect(await prepareAffiliatePayout("aff", m.stripe as any, rates, new Date("2026-11-01T00:00:00Z"))).toEqual(expect.objectContaining({ month: "2026-11" }));
  });
  it("does not combine incompatible settlement currencies", async () => {
    m.stripe.charges.retrieve.mockResolvedValueOnce({ amount: 15000, currency: "eur", balance_transaction: { currency: "usd", amount: 15000, available_on: 1 } });
    await expect(prepareAffiliatePayout("aff", m.stripe as any, rates, now)).rejects.toThrow("Mixed settlement");
    expect(m.tx.affiliatePayout.create).not.toHaveBeenCalled();
  });
  it("sets monthly bank payouts before sending one grouped transfer", async () => {
    expect(await sendAffiliatePayout("batch", "aff", "acct", m.stripe as any)).toBe(true);
    expect(m.stripe.accounts.update).toHaveBeenCalledWith("acct", { settings: { payouts: { schedule: { interval: "monthly", monthly_anchor: 28 } } } });
    expect(m.stripe.transfers.create).toHaveBeenCalledExactlyOnceWith({ amount: 60000, currency: "sek", destination: "acct", transfer_group: "affiliate_batch_batch", metadata: { note2tabsAffiliateId: "aff", note2tabsPayoutId: "batch" } }, { idempotencyKey: "affiliate_batch_batch" });
    expect(m.tx.affiliateCommission.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "PAID" }) }));
  });
  it("recovers a successful Stripe transfer after a failed DB commit without sending twice", async () => {
    m.stripe.transfers.list.mockResolvedValue({ data: [{ id: "tr_previous", amount: 60000, currency: "sek", destination: "acct" }] });
    expect(await sendAffiliatePayout("batch", "aff", "acct", m.stripe as any)).toBe(true);
    expect(m.stripe.transfers.create).not.toHaveBeenCalled();
    expect(m.tx.affiliatePayout.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ stripeTransferId: "tr_previous" }) }));
  });
  it("holds funds if monthly scheduling is rejected", async () => {
    m.stripe.accounts.update.mockRejectedValue(new Error("schedule unavailable"));
    await expect(sendAffiliatePayout("batch", "aff", "acct", m.stripe as any)).rejects.toThrow();
    expect(m.stripe.transfers.create).not.toHaveBeenCalled();
  });
  it("waits for completed onboarding", async () => {
    m.stripe.accounts.retrieve.mockResolvedValue({ id: "acct", payouts_enabled: false, details_submitted: false });
    expect(await sendAffiliatePayout("batch", "aff", "acct", m.stripe as any)).toBe(false);
    expect(m.stripe.transfers.create).not.toHaveBeenCalled();
  });
  it("keeps unpaid records pending when Stripe has insufficient available funds", async () => {
    m.stripe.transfers.create.mockRejectedValue(new Error("balance_insufficient"));
    await expect(sendAffiliatePayout("batch", "aff", "acct", m.stripe as any)).rejects.toThrow();
    expect(m.tx.affiliatePayout.update).not.toHaveBeenCalled();
    expect(m.tx.affiliateCommission.updateMany).not.toHaveBeenCalled();
  });
  it("cancels a frozen batch if an included commission was refunded before transfer", async () => {
    m.tx.affiliatePayout.findUniqueOrThrow.mockResolvedValue({ ...payout, commissions: [{ status: "REVERSED" }, { status: "PENDING" }] });
    expect(await sendAffiliatePayout("batch", "aff", "acct", m.stripe as any)).toBe(false);
    expect(m.stripe.transfers.create).not.toHaveBeenCalled();
    expect(m.tx.affiliateCommission.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { payoutId: null, payoutAmount: null } }));
  });
});

describe("refunds against a monthly payout", () => {
  const paidCommission = { id: "c1", status: "PAID", payoutId: "batch", payoutAmount: 30000, commissionAmount: 3000,
    affiliate: {stripeAccountId: "acct"}, payout: {...payout, status: "PAID", stripeTransferId: "tr_batch"} };
  beforeEach(() => {
    m.tx.affiliateCommission.findUnique.mockResolvedValue(paidCommission);
    m.stripe.transfers.listReversals.mockImplementation(async function* () {});
  });
  it("reverses only the refunded commission's allocation in settlement currency", async () => {
    await reverseCommissionTransfer(m.tx as any, m.stripe as any, "c1");
    expect(m.stripe.transfers.createReversal).toHaveBeenCalledExactlyOnceWith("tr_batch", {amount: 30000, metadata: {note2tabsCommissionId: "c1"}}, {idempotencyKey: "affiliate-reversal-c1"});
  });
  it("retains legacy per-invoice reversal amounts", async () => {
    m.tx.affiliateCommission.findUnique.mockResolvedValue({...paidCommission, payoutId: null, payout: null, stripeTransferId: "tr_legacy"});
    await reverseCommissionTransfer(m.tx as any, m.stripe as any, "c1");
    expect(m.stripe.transfers.createReversal).toHaveBeenCalledWith("tr_legacy", expect.objectContaining({amount: 3000}), expect.anything());
  });
  it("recovers a previously successful reversal without reversing twice", async () => {
    m.stripe.transfers.listReversals.mockImplementation(async function* () {yield {amount:30000,metadata:{note2tabsCommissionId:"c1"}};});
    await reverseCommissionTransfer(m.tx as any, m.stripe as any, "c1");
    expect(m.stripe.transfers.createReversal).not.toHaveBeenCalled();
    expect(m.tx.affiliateCommission.update).toHaveBeenCalled();
  });
  it("does not reverse money for an unpaid commission", async () => {
    m.tx.affiliateCommission.findUnique.mockResolvedValue({...paidCommission, status:"PENDING", payoutId:null, payout:null});
    await reverseCommissionTransfer(m.tx as any, m.stripe as any, "c1");
    expect(m.stripe.transfers.createReversal).not.toHaveBeenCalled();
  });
  it("reconciles a transferred batch whose database acknowledgement failed before refunding", async () => {
    m.tx.affiliateCommission.findUnique.mockResolvedValue({...paidCommission, status:"PENDING", payout:{...payout,status:"PENDING"}});
    m.stripe.transfers.list.mockResolvedValue({data:[{id:"tr_batch",amount:60000,currency:"sek",destination:"acct"}]});
    m.tx.affiliateCommission.findUniqueOrThrow.mockResolvedValue(paidCommission);
    await reverseCommissionTransfer(m.tx as any,m.stripe as any,"c1");
    expect(m.stripe.transfers.createReversal).toHaveBeenCalledWith("tr_batch",expect.objectContaining({amount:30000}),expect.anything());
  });
});
