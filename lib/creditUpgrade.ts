import { createHash } from "crypto";
import type Stripe from "stripe";
import { createPostHogServerClient } from "./posthogServer";
import { prisma } from "./prisma";
import { stripeClient } from "./stripe";
import { creditUpgradePrice, exchangedCreditBalance } from "./creditUpgradePricing";

export class CreditUpgradeError extends Error {}

export const creditUpgradeEnabled = () => process.env.CREDIT_UPGRADE_ENABLED === "true";

function monthlyAmount(price: Stripe.Price, currency: string) {
  const amount = price.currency === currency ? price.unit_amount : price.currency_options?.[currency]?.unit_amount;
  if (!price.active || price.recurring?.interval !== "month" || (price.recurring.interval_count || 1) !== 1 || !Number.isSafeInteger(amount) || !amount || amount < 0) {
    throw new CreditUpgradeError("This subscription price cannot be upgraded automatically.");
  }
  return amount;
}

export async function prepareCreditUpgrade(userId: string, sub: Stripe.Subscription, priceId: string) {
  if (!stripeClient) throw new CreditUpgradeError("Billing unavailable.");
  if (sub.status !== "active" || sub.collection_method !== "charge_automatically" || sub.schedule || sub.cancel_at_period_end || sub.items.data.length !== 1 || (sub.items.data[0].quantity || 1) !== 1) {
    throw new CreditUpgradeError("This subscription needs a billing review before upgrading.");
  }
  const existing = await prisma.creditUpgrade.findUnique({ where: { subscriptionId_oldPeriodStart: { subscriptionId: sub.id, oldPeriodStart: sub.current_period_start } } });
  if (existing) {
    if (existing.userId !== userId) throw new CreditUpgradeError("This subscription needs an account ownership review.");
    return existing;
  }
  if (sub.pending_update) throw new CreditUpgradeError("Complete or cancel your pending subscription change first.");
  const invoice = typeof sub.latest_invoice === "string" ? await stripeClient.invoices.retrieve(sub.latest_invoice) : sub.latest_invoice;
  if (!invoice || invoice.status !== "paid") throw new CreditUpgradeError("Pay your current subscription invoice before upgrading.");
  const [premium, pro] = await Promise.all([
    stripeClient.prices.retrieve(sub.items.data[0].price.id, { expand: ["currency_options"] }),
    stripeClient.prices.retrieve(priceId, { expand: ["currency_options"] }),
  ]);
  const currency = sub.currency;
  const premiumAmount = monthlyAmount(premium, currency);
  const proAmount = monthlyAmount(pro, currency);
  // Read the backend's actual debit balance, never the cached session balance.
  const rows = await prisma.$queryRaw<Array<{ credits: number }>>`SELECT credits FROM user_credits WHERE "userId"=${userId}`;
  if (!rows.length) throw new CreditUpgradeError("Your credit balance is unavailable. Please try again.");
  const valuation = creditUpgradePrice(premiumAmount, proAmount, rows[0].credits);
  const id = createHash("sha256").update(JSON.stringify([sub.id, sub.current_period_start, priceId, currency, valuation])).digest("hex").slice(0, 40);
  return { id, userId, subscriptionId: sub.id, oldPeriodStart: sub.current_period_start, oldInvoiceId: invoice.id, priceId, currency, ...valuation };
}

export async function payCreditUpgrade(quote: Awaited<ReturnType<typeof prepareCreditUpgrade>>, quoteId: string) {
  if (!stripeClient) throw new CreditUpgradeError("Billing unavailable.");
  if (quote.id !== quoteId) throw new CreditUpgradeError("Your credit balance changed. Review the updated upgrade price.");
  // The unique billing-period key also serializes concurrent requests with different quotes.
  const saved = await prisma.creditUpgrade.upsert({
    where: { subscriptionId_oldPeriodStart: { subscriptionId: quote.subscriptionId, oldPeriodStart: quote.oldPeriodStart } },
    create: { id: quote.id, userId: quote.userId, subscriptionId: quote.subscriptionId, oldPeriodStart: quote.oldPeriodStart, oldInvoiceId: quote.oldInvoiceId, priceId: quote.priceId, currency: quote.currency, credits: quote.credits, discount: quote.discount, regularAmount: quote.regularAmount },
    update: {},
  });
  if (saved.id !== quoteId) throw new CreditUpgradeError("An upgrade is already in progress. Review its price before continuing.");
  const current = await stripeClient.subscriptions.retrieve(saved.subscriptionId, { expand: ["latest_invoice"] });
  if (current.pending_update || current.items.data[0]?.price.id === saved.priceId) {
    return upgradeResult(current);
  }
  if (current.status !== "active" || current.cancel_at_period_end || current.schedule) throw new CreditUpgradeError("Your subscription changed. Review billing settings before upgrading.");
  if (current.current_period_start !== saved.oldPeriodStart) throw new CreditUpgradeError("Your subscription renewed. Review the upgrade again.");
  let attempt = saved.attempt;
  const latest = typeof current.latest_invoice === "string" ? await stripeClient.invoices.retrieve(current.latest_invoice) : current.latest_invoice;
  if (latest?.status === "void") {
    if (latest.discount?.coupon?.metadata?.note2tabsCreditUpgrade !== saved.id) throw new CreditUpgradeError("Your last invoice changed. Review billing settings before upgrading.");
    // Expired pending updates have void invoices. Reusing the old Stripe key
    // would return an unpayable invoice; one new key per void invoice is safe
    // even when several tabs retry concurrently.
    attempt = await prisma.$transaction(async tx => {
      const [record] = await tx.$queryRaw<Array<{ attempt: number; lastVoidedInvoiceId: string | null }>>`SELECT attempt,"lastVoidedInvoiceId" FROM "CreditUpgrade" WHERE id=${saved.id} FOR UPDATE`;
      if (record.lastVoidedInvoiceId === latest.id) return record.attempt;
      return (await tx.creditUpgrade.update({ where: { id: saved.id }, data: { attempt: { increment: 1 }, lastVoidedInvoiceId: latest.id } })).attempt;
    });
  }
  let coupon: string | undefined;
  if (saved.discount > 0) {
    coupon = (await stripeClient.coupons.create({
      amount_off: saved.discount, currency: saved.currency, duration: "once",
      name: "Premium credit exchange", metadata: { note2tabsCreditUpgrade: saved.id },
    }, { idempotencyKey: `credit-upgrade-coupon-${saved.id}` })).id;
  }
  const updated = await stripeClient.subscriptions.update(saved.subscriptionId, {
    items: [{ id: current.items.data[0].id, price: saved.priceId }],
    billing_cycle_anchor: "now", proration_behavior: "none", payment_behavior: "pending_if_incomplete",
    discounts: coupon ? [{ coupon }] : [],
    expand: ["latest_invoice"],
  }, { idempotencyKey: `credit-upgrade-payment-${saved.id}-${attempt}` });
  return upgradeResult(updated);
}

async function upgradeResult(sub: Stripe.Subscription) {
  if (!stripeClient) throw new CreditUpgradeError("Billing unavailable.");
  const invoice = typeof sub.latest_invoice === "string" ? await stripeClient.invoices.retrieve(sub.latest_invoice) : sub.latest_invoice;
  if (sub.pending_update || invoice?.status !== "paid") {
    if (!invoice?.hosted_invoice_url) throw new CreditUpgradeError("Payment requires attention. Open billing settings to complete it.");
    return { changed: false, pending: true, url: invoice.hosted_invoice_url };
  }
  if (await applyCreditUpgrade(sub, invoice) !== "applied") throw new CreditUpgradeError("Payment received. Your upgrade is still being confirmed; refresh billing settings shortly.");
  return { changed: true, effective: "immediate", plan: "pro", billingInterval: "monthly" };
}

/** Delayed Premium events must not overwrite a completed Pro exchange. */
export async function currentCreditUpgradeSubscription(subscription: Stripe.Subscription) {
  if (!stripeClient || (!creditUpgradeEnabled() && process.env.CREDIT_UPGRADE_WEBHOOKS_ENABLED !== "true")) return subscription;
  const exchange = await prisma.creditUpgrade.findFirst({ where: { subscriptionId: subscription.id }, select: { id: true } });
  return exchange ? stripeClient.subscriptions.retrieve(subscription.id) : subscription;
}

/** Shared by the API and signed webhooks. Locks the same row used by backend debits. */
export async function applyCreditUpgrade(sub: Stripe.Subscription, paidInvoice?: Stripe.Invoice | null): Promise<"unrelated" | "pending" | "applied"> {
  if (!stripeClient || (!creditUpgradeEnabled() && process.env.CREDIT_UPGRADE_WEBHOOKS_ENABLED !== "true")) return "unrelated";
  const latestId = typeof sub.latest_invoice === "string" ? sub.latest_invoice : sub.latest_invoice?.id;
  const upgrade = await prisma.creditUpgrade.findFirst({ where: { subscriptionId: sub.id }, orderBy: { createdAt: "desc" } });
  if (!upgrade || (upgrade.appliedAt && upgrade.invoiceId !== latestId)) return "unrelated";
  if (upgrade.appliedAt) return "applied";
  // Pending updates retain Premium; do not interpret the old paid invoice as the upgrade.
  if (sub.status !== "active" || sub.pending_update || sub.items.data[0]?.price.id !== upgrade.priceId || latestId === upgrade.oldInvoiceId) return "pending";
  const invoice = paidInvoice || (typeof sub.latest_invoice === "string" ? await stripeClient.invoices.retrieve(sub.latest_invoice) : sub.latest_invoice);
  if (!invoice || invoice.id !== latestId || invoice.status !== "paid") return "pending";
  if (invoice.billing_reason !== "subscription_update") return "unrelated";
  if (upgrade.discount > 0 && invoice.discount?.coupon?.metadata?.note2tabsCreditUpgrade !== upgrade.id) throw new CreditUpgradeError("Upgrade invoice does not contain the confirmed credit exchange.");
  const applied = await prisma.$transaction(async tx => {
    const [locked] = await tx.$queryRaw<Array<{ appliedAt: Date | null }>>`SELECT "appliedAt" FROM "CreditUpgrade" WHERE id=${upgrade.id} FOR UPDATE`;
    if (locked.appliedAt) return false;
    await tx.$queryRaw`SELECT id FROM "User" WHERE id=${upgrade.userId} FOR UPDATE`;
    const [wallet] = await tx.$queryRaw<Array<{ credits: number }>>`SELECT credits FROM user_credits WHERE "userId"=${upgrade.userId} FOR UPDATE`;
    if (!wallet) throw new CreditUpgradeError("Credit wallet unavailable during upgrade.");
    const balance = exchangedCreditBalance(wallet.credits, upgrade.credits);
    await tx.$executeRaw`UPDATE user_credits SET credits=${balance},"updatedAt"=NOW() WHERE "userId"=${upgrade.userId}`;
    await tx.user.update({ where: { id: upgrade.userId }, data: { role: "PREMIUM", subscriptionPlan: "PRO", tokensRemaining: balance } });
    await tx.creditUpgrade.update({ where: { id: upgrade.id }, data: { invoiceId: invoice.id, appliedAt: new Date() } });
    return true;
  });
  if (applied) {
    try {
      const analytics = createPostHogServerClient();
      analytics?.capture({ distinctId: upgrade.userId, event: "subscription_upgraded", properties: { from_plan: "premium", to_plan: "pro", effective: "immediate", billing_interval: "monthly", credits_exchanged: upgrade.credits, discount_minor: upgrade.discount, currency: upgrade.currency, stripe_invoice_id: invoice.id, $insert_id: `credit-upgrade:${invoice.id}` } });
      await analytics?.flush();
    } catch { /* Billing and credit fulfillment must not depend on analytics. */ }
  }
  return "applied";
}
