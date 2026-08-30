import type { NextApiRequest, NextApiResponse } from "next";
import type Stripe from "stripe";
import { stripeClient } from "../../../lib/stripe";
import { prisma } from "../../../lib/prisma";
import {
  PREMIUM_MONTHLY_CREDITS,
  STARTING_CREDITS,
  capCreditBalance,
} from "../../../lib/credits";
import {
  getStripePremiumConfig,
  stripeCheckoutSessionMatchesPremium,
  stripeInvoiceMatchesPremium,
  stripeInvoiceRenewalAt,
  stripeSubscriptionId,
  stripeSubscriptionMatchesPremium,
  type StripePremiumConfig,
} from "../../../lib/stripePremium";
import {
  createPostHogServerClient,
  flushPostHogServerClientInBackground,
} from "../../../lib/posthogServer";
import {
  normalizePremiumFunnelId,
  normalizePremiumFunnelReason,
  normalizePremiumFunnelSource,
} from "../../../lib/premiumFunnel";
import { normalizePremiumOfferVariant } from "../../../lib/premiumOfferExperiment";
import { sendTransactionalEmail } from "../../../lib/email";
import {
  buildPremiumTrialStartedEmail,
  buildPremiumTrialReminderEmail,
  customPremiumTrialReminderEnabled,
} from "../../../lib/premiumTrialReminder";
import { commissionAmount } from "../../../lib/affiliate";
import { buildPaymentFailedEmail } from "../../../lib/paymentRecovery";

export const config = {
  api: {
    bodyParser: false,
  },
};

async function readBuffer(req: NextApiRequest): Promise<Buffer> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

type UserIdentifier = { id: string } | { email: string };

const ENTITLED_SUBSCRIPTION_STATUSES = new Set<Stripe.Subscription.Status>([
  "active",
  "trialing",
  "past_due",
]);

const REVOKED_SUBSCRIPTION_STATUSES = new Set<Stripe.Subscription.Status>([
  "canceled",
  "incomplete_expired",
  "paused",
  "unpaid",
]);

const normalizeEmail = (email?: string | null) => {
  if (!email || typeof email !== "string") return null;
  const trimmed = email.trim().toLowerCase();
  return trimmed || null;
};

async function resolveUserIdentifierFromCheckoutSession(
  session: Stripe.Checkout.Session
): Promise<UserIdentifier | null> {
  const userIdRaw = session?.metadata?.userId;
  if (typeof userIdRaw === "string" && userIdRaw.trim()) {
    return { id: userIdRaw.trim() };
  }

  const detailsEmail = normalizeEmail(session?.customer_details?.email || null);
  if (detailsEmail) return { email: detailsEmail };

  const customerEmail = normalizeEmail(
    typeof session?.customer_email === "string" ? session.customer_email : null
  );
  if (customerEmail) return { email: customerEmail };

  if (!stripeClient || typeof session?.customer !== "string" || !session.customer) {
    return null;
  }
  try {
    const customer = await stripeClient.customers.retrieve(session.customer);
    if (customer && !("deleted" in customer)) {
      const email = normalizeEmail(customer.email);
      if (email) return { email };
    }
  } catch (error) {
    console.error("Webhook customer lookup failed.", error);
  }
  return null;
}

async function resolveEmailFromCustomerRef(
  customerRef: string | Stripe.Customer | Stripe.DeletedCustomer | null | undefined
) {
  if (!customerRef) return null;
  if (typeof customerRef === "object") {
    if ("deleted" in customerRef) return null;
    return normalizeEmail(customerRef.email);
  }
  if (!stripeClient || typeof customerRef !== "string" || !customerRef.trim()) {
    return null;
  }
  try {
    const customer = await stripeClient.customers.retrieve(customerRef);
    if (customer && !("deleted" in customer)) {
      return normalizeEmail(customer.email);
    }
  } catch (error) {
    console.error("Webhook customer retrieval failed.", error);
  }
  return null;
}

async function customerHasEntitledSubscription(
  customerId: string,
  premiumConfig: StripePremiumConfig
) {
  if (!stripeClient || !customerId.trim()) return false;
  const subscriptions = await stripeClient.subscriptions.list({
    customer: customerId,
    status: "all",
    limit: 100,
  });
  return subscriptions.data.some(
    (subscription) =>
      stripeSubscriptionMatchesPremium(subscription, premiumConfig) &&
      ENTITLED_SUBSCRIPTION_STATUSES.has(subscription.status)
  );
}

async function emailHasEntitledSubscription(
  email: string,
  premiumConfig: StripePremiumConfig,
  excludedCustomerId?: string | null
) {
  if (!stripeClient) return false;
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return false;
  const customers = await stripeClient.customers.list({
    email: normalizedEmail,
    limit: 100,
  });
  for (const customer of customers.data) {
    if ("deleted" in customer) continue;
    if (excludedCustomerId && customer.id === excludedCustomerId) continue;
    if (await customerHasEntitledSubscription(customer.id, premiumConfig)) {
      return true;
    }
  }
  return false;
}

async function setPremiumForIdentifier(identifier: UserIdentifier) {
  const user = await prisma.user.findFirst({
    where: identifier,
    select: { id: true, role: true, tokensRemaining: true },
  });
  if (!user) return null;
  if (user.role === "ADMIN" || user.role === "MODERATOR" || user.role === "MOD") {
    return null;
  }
  const isAlreadyPremium = user.role === "PREMIUM";
  const tokensRemaining =
    !isAlreadyPremium
      ? PREMIUM_MONTHLY_CREDITS
      : capCreditBalance(user.tokensRemaining);
  await prisma.user.update({
    where: { id: user.id },
    data: {
      role: "PREMIUM",
      tokensRemaining,
    },
  });
  return user.id;
}

function trackSubscriptionStarted(userId: string, session: Stripe.Checkout.Session) {
  const client = createPostHogServerClient();
  if (!client) return;
  const funnelId =
    normalizePremiumFunnelId(session.metadata?.premiumFunnelId) ||
    normalizePremiumFunnelId(session.client_reference_id);
  const model = session.metadata?.premiumFunnelModel === "heavy"
    ? "heavy"
    : session.metadata?.premiumFunnelModel === "light"
      ? "light"
      : "unknown";
  client.capture({
    distinctId: userId,
    event: "subscription_started",
    properties: {
      plan: "premium_monthly",
      source: normalizePremiumFunnelSource(session.metadata?.premiumFunnelSource),
      reason: normalizePremiumFunnelReason(session.metadata?.premiumFunnelReason),
      funnel_id: funnelId || undefined,
      trial_included: session.metadata?.premiumTrialIncluded === "true",
      offer_variant: normalizePremiumOfferVariant(session.metadata?.premiumOfferVariant),
      model,
      event_source: "stripe_webhook",
      $insert_id: `subscription-started:${session.id}`,
    },
  });
  flushPostHogServerClientInBackground(client);
}

type SubscriptionLifecycleEvent =
  | "subscription_cancel_scheduled"
  | "subscription_cancellation_reversed"
  | "subscription_ended"
  | "subscription_payment_failed"
  | "subscription_renewed"
  | "subscription_trial_reminder_sent"
  | "subscription_trial_started_notice_sent"
  | "subscription_trial_ending";

async function resolveUserIdFromEmail(email: string | null) {
  if (!email) return null;
  const user = await prisma.user.findFirst({
    where: { email: email.toLowerCase() },
    select: { id: true },
  });
  return user?.id || null;
}

async function resolveUserIdFromSubscription(
  subscription: Stripe.Subscription,
  fallbackEmail: string | null
) {
  const metadataUserId = subscription.metadata?.userId?.trim();
  if (metadataUserId) {
    const user = await prisma.user.findUnique({
      where: { id: metadataUserId },
      select: { id: true },
    });
    if (user?.id) return user.id;
  }
  return resolveUserIdFromEmail(fallbackEmail);
}

function unixDaysRemaining(timestamp?: number | null) {
  if (!timestamp) return undefined;
  return Math.max(0, Math.ceil((timestamp * 1000 - Date.now()) / 86_400_000));
}

function trackSubscriptionLifecycle(
  userId: string,
  lifecycleEvent: SubscriptionLifecycleEvent,
  stripeEventId: string,
  properties: Record<string, string | number | boolean | null | undefined> = {}
) {
  const client = createPostHogServerClient();
  if (!client) return;
  client.capture({
    distinctId: userId,
    event: lifecycleEvent,
    properties: {
      plan: "premium_monthly",
      event_source: "stripe_webhook",
      ...properties,
      $insert_id: `${lifecycleEvent}:${stripeEventId}`,
    },
  });
  flushPostHogServerClientInBackground(client);
}

async function sendPremiumTrialReminder(
  userId: string,
  email: string,
  trialEnd: number,
  stripeEventId: string
) {
  if (!customPremiumTrialReminderEnabled()) return;
  const reminderIdentifier = `reminder:premium-trial:${userId}`;
  const reminderToken = `stripe-event:${stripeEventId}`;
  try {
    await prisma.verificationToken.create({
      data: {
        identifier: reminderIdentifier,
        token: reminderToken,
        expires: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      },
    });
  } catch (error) {
    if (prismaErrorCode(error) === "P2002") return;
    throw error;
  }
  const [user, latestEditor] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { name: true },
    }),
    prisma.canvases.findFirst({
      where: { user_id: userId },
      orderBy: { updated_at: "desc" },
      select: { canvas_id: true, name: true },
    }),
  ]);
  const reminder = buildPremiumTrialReminderEmail({
    name: user?.name,
    trialEndsAt: new Date(trialEnd * 1000),
    latestEditor: latestEditor
      ? { id: latestEditor.canvas_id, name: latestEditor.name }
      : null,
  });
  try {
    await sendTransactionalEmail({
      to: email,
      subject: reminder.subject,
      html: reminder.html,
      text: reminder.text,
    });
  } catch (error) {
    await prisma.verificationToken.deleteMany({
      where: { identifier: reminderIdentifier, token: reminderToken },
    });
    throw error;
  }
  trackSubscriptionLifecycle(userId, "subscription_trial_reminder_sent", stripeEventId, {
    destination: latestEditor ? "latest_editor_practice" : "transcriber",
  });
}

async function sendPremiumTrialStartedNotice(
  userId: string,
  session: Stripe.Checkout.Session,
  stripeEventId: string
) {
  if (!customPremiumTrialReminderEnabled() || !stripeClient) return;
  const subscriptionRef = session.subscription;
  if (!subscriptionRef) return;
  const subscription =
    typeof subscriptionRef === "string"
      ? await stripeClient.subscriptions.retrieve(subscriptionRef)
      : subscriptionRef;
  if (subscription.status !== "trialing" || !subscription.trial_end) return;

  const marker = {
    identifier: `notice:premium-trial-started:${userId}`,
    token: `stripe-event:${stripeEventId}:trial-started`,
  };
  try {
    await prisma.verificationToken.create({
      data: {
        ...marker,
        expires: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      },
    });
  } catch (error) {
    if (prismaErrorCode(error) === "P2002") return;
    throw error;
  }

  const [user, latestEditor] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, name: true },
    }),
    prisma.canvases.findFirst({
      where: { user_id: userId },
      orderBy: { updated_at: "desc" },
      select: { canvas_id: true, name: true },
    }),
  ]);
  if (!user?.email) {
    await prisma.verificationToken.deleteMany({ where: marker });
    return;
  }
  const notice = buildPremiumTrialStartedEmail({
    name: user.name,
    trialStartsAt: new Date((subscription.trial_start || subscription.created) * 1000),
    trialEndsAt: new Date(subscription.trial_end * 1000),
    latestEditor: latestEditor
      ? { id: latestEditor.canvas_id, name: latestEditor.name }
      : null,
  });
  try {
    await sendTransactionalEmail({
      to: user.email,
      subject: notice.subject,
      html: notice.html,
      text: notice.text,
    });
  } catch (error) {
    await prisma.verificationToken.deleteMany({ where: marker });
    throw error;
  }
  trackSubscriptionLifecycle(userId, "subscription_trial_started_notice_sent", stripeEventId, {
    destination: latestEditor ? "latest_editor_practice" : "transcriber",
  });
}

function checkoutPromotionCodeId(session: Stripe.Checkout.Session) {
  const discounts = (session.total_details as any)?.breakdown?.discounts || [];
  for (const entry of discounts) {
    const promotionCode = entry?.discount?.promotion_code;
    if (typeof promotionCode === "string") return promotionCode;
    if (typeof promotionCode?.id === "string") return promotionCode.id;
  }
  return null;
}

async function persistAffiliateAttribution(
  checkoutSession: Stripe.Checkout.Session,
  userId: string
) {
  let attributionId = checkoutSession.metadata?.note2tabsAffiliateAttributionId || null;
  if (!attributionId && stripeClient && checkoutSession.id) {
    const expanded = await stripeClient.checkout.sessions.retrieve(checkoutSession.id, {
      expand: ["subscription", "total_details.breakdown.discounts.discount.promotion_code"],
    });
    if (!expanded) return;
    const promotionCodeId = checkoutPromotionCodeId(expanded);
    const affiliate = promotionCodeId
      ? await prisma.affiliate.findFirst({
          where: { stripePromotionCodeId: promotionCodeId, status: "ACTIVE", userId: { not: userId } },
        })
      : null;
    if (affiliate) {
      const attribution = await prisma.affiliateAttribution.upsert({
        where: { referredUserId: userId },
        create: { affiliateId: affiliate.id, referredUserId: userId, source: "promotion_code" },
        update: {},
      });
      attributionId = attribution.id;
    }
  }
  if (!attributionId) return;
  const subscriptionId = stripeSubscriptionId(checkoutSession.subscription as any);
  const customerId = stripeSubscriptionId(checkoutSession.customer as any);
  const attribution = await prisma.affiliateAttribution.findUnique({ where: { id: attributionId } });
  if (!attribution || attribution.referredUserId !== userId) return;
  await prisma.affiliateAttribution.update({
    where: { id: attribution.id },
    data: {
      ...(customerId ? { stripeCustomerId: customerId } : {}),
      ...(subscriptionId ? { stripeSubscriptionId: subscriptionId } : {}),
    },
  });
  if (subscriptionId && stripeClient) {
    await stripeClient.subscriptions.update(subscriptionId, {
      metadata: {
        note2tabsAffiliateId: attribution.affiliateId,
        note2tabsAffiliateAttributionId: attribution.id,
      },
    });
  }
}

async function createAffiliateCommission(invoice: Stripe.Invoice, subscription: Stripe.Subscription) {
  if (!invoice.id || !invoice.amount_paid || invoice.amount_paid <= 0) return;
  const subscriptionId = stripeSubscriptionId(subscription);
  const attributionId = subscription.metadata?.note2tabsAffiliateAttributionId;
  const attribution = await prisma.affiliateAttribution.findFirst({
    where: attributionId
      ? { id: attributionId }
      : subscriptionId
        ? { stripeSubscriptionId: subscriptionId }
        : { id: "" },
    include: { affiliate: true, commissions: { select: { id: true } } },
  });
  if (!attribution || attribution.affiliate.status !== "ACTIVE") return;
  const paymentNumber = attribution.commissions.length + 1;
  if (paymentNumber > attribution.affiliate.commissionMonths) return;
  const amount = commissionAmount(invoice.amount_paid, attribution.affiliate.commissionPercent);
  if (amount <= 0) return;
  const chargeId = typeof invoice.charge === "string" ? invoice.charge : invoice.charge?.id || null;
  try {
    await prisma.affiliateCommission.create({
      data: {
        affiliateId: attribution.affiliateId,
        attributionId: attribution.id,
        stripeInvoiceId: invoice.id,
        stripeChargeId: chargeId,
        paymentNumber,
        grossAmount: invoice.amount_paid,
        commissionAmount: amount,
        currency: invoice.currency.toLowerCase(),
        availableAt: new Date(Date.now() + attribution.affiliate.payoutHoldDays * 86_400_000),
      },
    });
  } catch (error) {
    if (prismaErrorCode(error) !== "P2002") throw error;
  }
}

async function reverseAffiliateCommission(chargeId: string) {
  const commissions = await prisma.affiliateCommission.findMany({
    where: { stripeChargeId: chargeId, status: { in: ["PENDING", "PAID"] } },
  });
  for (const commission of commissions) {
    if (commission.status === "PAID" && commission.stripeTransferId && stripeClient) {
      await stripeClient.transfers.createReversal(commission.stripeTransferId, {
        amount: commission.commissionAmount,
        metadata: { note2tabsCommissionId: commission.id },
      }, { idempotencyKey: `affiliate-reversal-${commission.id}` });
    }
    await prisma.affiliateCommission.update({
      where: { id: commission.id },
      data: { status: "REVERSED", reversedAt: new Date() },
    });
  }
}

async function sendPaymentFailedNotice(
  userId: string,
  email: string,
  invoiceId: string,
  attemptCount: number
) {
  // Set this to "stripe" when Stripe's own failed-payment emails are enabled,
  // so customers receive one recovery message rather than two.
  if (process.env.PAYMENT_RECOVERY_EMAIL_MODE === "stripe") return;
  if (attemptCount !== 1) return;
  const marker = {
    identifier: `notice:premium-payment-failed:${userId}`,
    token: `stripe-invoice:${invoiceId}`,
  };
  try {
    await prisma.verificationToken.create({
      data: {
        ...marker,
        expires: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      },
    });
  } catch (error) {
    if (prismaErrorCode(error) === "P2002") return;
    throw error;
  }
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true },
  });
  const notice = buildPaymentFailedEmail({ name: user?.name });
  try {
    await sendTransactionalEmail({ to: email, ...notice });
  } catch (error) {
    await prisma.verificationToken.deleteMany({ where: marker });
    throw error;
  }
}

type RenewalInvoiceDetails = {
  invoiceId: string;
  stripeSubscriptionId: string;
  renewalAt: Date;
};

const prismaErrorCode = (error: unknown) =>
  typeof error === "object" && error !== null && "code" in error
    ? String((error as { code?: unknown }).code || "")
    : "";

async function grantRenewalForIdentifier(
  identifier: UserIdentifier,
  renewal: RenewalInvoiceDetails
) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(
        async (tx) => {
          const alreadyProcessed = await tx.stripeRenewalInvoice.findUnique({
            where: { invoiceId: renewal.invoiceId },
            select: { invoiceId: true },
          });
          if (alreadyProcessed) return "duplicate" as const;

          const user = await tx.user.findFirst({
            where: identifier,
            select: { id: true, role: true, tokensRemaining: true },
          });
          if (!user || user.role === "ADMIN" || user.role === "MODERATOR" || user.role === "MOD") {
            return "ignored" as const;
          }

          const latestGrantedRenewal = await tx.stripeRenewalInvoice.findFirst({
            where: { userId: user.id, granted: true },
            orderBy: [{ renewalAt: "desc" }, { processedAt: "desc" }],
            select: { renewalAt: true },
          });
          const isOutOfOrder = Boolean(
            latestGrantedRenewal && renewal.renewalAt <= latestGrantedRenewal.renewalAt
          );

          await tx.stripeRenewalInvoice.create({
            data: {
              invoiceId: renewal.invoiceId,
              userId: user.id,
              stripeSubscriptionId: renewal.stripeSubscriptionId,
              renewalAt: renewal.renewalAt,
              granted: !isOutOfOrder,
            },
          });
          if (isOutOfOrder) return "out_of_order" as const;

          const tokensRemaining =
            user.role === "PREMIUM"
              ? capCreditBalance(user.tokensRemaining + PREMIUM_MONTHLY_CREDITS)
              : PREMIUM_MONTHLY_CREDITS;
          await tx.user.update({
            where: { id: user.id },
            data: { role: "PREMIUM", tokensRemaining },
          });
          return "granted" as const;
        },
        { isolationLevel: "Serializable" }
      );
    } catch (error) {
      const code = prismaErrorCode(error);
      if (code === "P2002") return "duplicate" as const;
      if (code === "P2034" && attempt < 2) continue;
      throw error;
    }
  }
  return "ignored" as const;
}

async function downgradePremiumByEmail(
  email: string,
  premiumConfig: StripePremiumConfig,
  customerId?: string | null
) {
  if (customerId && (await customerHasEntitledSubscription(customerId, premiumConfig))) {
    return;
  }
  if (await emailHasEntitledSubscription(email, premiumConfig, customerId)) {
    return;
  }

  const user = await prisma.user.findFirst({
    where: { email: email.toLowerCase() },
    select: { id: true, role: true },
  });
  if (!user || user.role !== "PREMIUM") return;
  await prisma.user.update({
    where: { id: user.id },
    data: { role: "FREE", tokensRemaining: STARTING_CREDITS },
  });
}

async function checkoutSessionIsForPremium(
  session: Stripe.Checkout.Session,
  premiumConfig: StripePremiumConfig
) {
  if (!stripeClient) return false;
  if (session.mode && session.mode !== "subscription") return false;

  const subscriptionRef = session.subscription;
  if (subscriptionRef && typeof subscriptionRef === "object") {
    if (stripeSubscriptionMatchesPremium(subscriptionRef, premiumConfig)) return true;
  } else if (typeof subscriptionRef === "string") {
    const subscription = await stripeClient.subscriptions.retrieve(subscriptionRef);
    if (stripeSubscriptionMatchesPremium(subscription, premiumConfig)) return true;
  }

  if (!session.id) return false;
  const lineItems = await stripeClient.checkout.sessions.listLineItems(session.id, { limit: 100 });
  return lineItems.data.some((lineItem) =>
    stripeCheckoutSessionMatchesPremium(
      { line_items: { data: [lineItem] } } as Stripe.Checkout.Session,
      premiumConfig
    )
  );
}

async function premiumSubscriptionForInvoice(
  invoice: Stripe.Invoice,
  premiumConfig: StripePremiumConfig
) {
  if (!stripeClient) return null;
  const matchingLine = invoice.lines?.data?.find((line) =>
    stripeInvoiceMatchesPremium(
      { lines: { data: [line] } } as Stripe.Invoice,
      premiumConfig
    )
  );
  const subscriptionRef = invoice.subscription || matchingLine?.subscription || null;
  if (!subscriptionRef) return null;
  const subscription =
    typeof subscriptionRef === "string"
      ? await stripeClient.subscriptions.retrieve(subscriptionRef)
      : subscriptionRef;
  if (!stripeSubscriptionMatchesPremium(subscription, premiumConfig)) return null;
  if (invoice.lines?.data?.length && !stripeInvoiceMatchesPremium(invoice, premiumConfig)) return null;
  return subscription;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ error: "Method not allowed" });
  }

  const premiumConfig = getStripePremiumConfig();
  if (!stripeClient || !process.env.STRIPE_WEBHOOK_SECRET || !premiumConfig) {
    return res.status(503).json({ error: "Stripe not configured yet." });
  }

  const sig = req.headers["stripe-signature"];
  if (!sig || typeof sig !== "string") {
    return res.status(400).json({ error: "Missing signature" });
  }

  let event: Stripe.Event;
  try {
    const buf = await readBuffer(req);
    event = stripeClient.webhooks.constructEvent(buf, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error("Webhook signature verification failed.", err);
    return res.status(400).json({ error: "Invalid signature" });
  }

  try {
    if (event.type === "checkout.session.completed") {
      const checkoutSession = event.data.object as Stripe.Checkout.Session;
      if (!(await checkoutSessionIsForPremium(checkoutSession, premiumConfig))) {
        return res.status(200).json({ received: true, ignored: "unrelated_checkout" });
      }
      const identifier = await resolveUserIdentifierFromCheckoutSession(checkoutSession);
      if (identifier) {
        const userId = await setPremiumForIdentifier(identifier);
        if (userId) {
          trackSubscriptionStarted(userId, checkoutSession);
          await persistAffiliateAttribution(checkoutSession, userId);
          try {
            await sendPremiumTrialStartedNotice(userId, checkoutSession, event.id);
          } catch (error) {
            console.error("Premium trial started notice delivery failed", { userId, error });
          }
        }
      }
    }

    if (event.type === "customer.subscription.deleted") {
      const subscription = event.data.object as Stripe.Subscription;
      if (!stripeSubscriptionMatchesPremium(subscription, premiumConfig)) {
        return res.status(200).json({ received: true, ignored: "unrelated_subscription" });
      }
      const email = await resolveEmailFromCustomerRef(subscription.customer);
      const userId = await resolveUserIdFromSubscription(subscription, email);
      if (userId) {
        trackSubscriptionLifecycle(userId, "subscription_ended", event.id, {
          status: subscription.status,
          cancellation_reason: subscription.cancellation_details?.reason || undefined,
          cancellation_feedback: subscription.cancellation_details?.feedback || undefined,
        });
      }
      if (email) {
        await downgradePremiumByEmail(
          email,
          premiumConfig,
          stripeSubscriptionId(subscription.customer)
        );
      }
    }

    if (event.type === "customer.subscription.updated") {
      const subscription = event.data.object as Stripe.Subscription;
      if (!stripeSubscriptionMatchesPremium(subscription, premiumConfig)) {
        return res.status(200).json({ received: true, ignored: "unrelated_subscription" });
      }
      const email = await resolveEmailFromCustomerRef(subscription.customer);
      const userId = await resolveUserIdFromSubscription(subscription, email);
      const previous = event.data.previous_attributes as
        | Partial<Stripe.Subscription>
        | undefined;
      if (userId && previous && "cancel_at_period_end" in previous) {
        trackSubscriptionLifecycle(
          userId,
          subscription.cancel_at_period_end
            ? "subscription_cancel_scheduled"
            : "subscription_cancellation_reversed",
          event.id,
          {
            status: subscription.status,
            trial: subscription.status === "trialing",
            days_remaining: unixDaysRemaining(
              subscription.cancel_at || subscription.trial_end || subscription.current_period_end
            ),
            cancellation_reason: subscription.cancellation_details?.reason || undefined,
            cancellation_feedback: subscription.cancellation_details?.feedback || undefined,
          }
        );
      }
      if (ENTITLED_SUBSCRIPTION_STATUSES.has(subscription.status)) {
        if (userId) await setPremiumForIdentifier({ id: userId });
        else if (email) await setPremiumForIdentifier({ email });
      }
      if (email && REVOKED_SUBSCRIPTION_STATUSES.has(subscription.status)) {
        await downgradePremiumByEmail(
          email,
          premiumConfig,
          stripeSubscriptionId(subscription.customer)
        );
      }
    }

    if (event.type === "customer.subscription.trial_will_end") {
      const subscription = event.data.object as Stripe.Subscription;
      if (!stripeSubscriptionMatchesPremium(subscription, premiumConfig)) {
        return res.status(200).json({ received: true, ignored: "unrelated_subscription" });
      }
      const email = await resolveEmailFromCustomerRef(subscription.customer);
      const userId = await resolveUserIdFromSubscription(subscription, email);
      if (userId) {
        trackSubscriptionLifecycle(userId, "subscription_trial_ending", event.id, {
          status: subscription.status,
          days_remaining: unixDaysRemaining(subscription.trial_end),
          cancel_at_period_end: subscription.cancel_at_period_end,
        });
        if (email && subscription.trial_end && !subscription.cancel_at_period_end) {
          try {
            await sendPremiumTrialReminder(userId, email, subscription.trial_end, event.id);
          } catch (error) {
            // Reminder delivery must not cause Stripe to retry an otherwise
            // successfully handled billing event.
            console.error("Premium trial reminder delivery failed", { userId, error });
          }
        }
      }
    }

    if (event.type === "invoice.payment_succeeded") {
      const invoice = event.data.object as Stripe.Invoice;
      const premiumSubscription = await premiumSubscriptionForInvoice(invoice, premiumConfig);
      if (!premiumSubscription) {
        return res.status(200).json({ received: true, ignored: "unrelated_invoice" });
      }
      if (!ENTITLED_SUBSCRIPTION_STATUSES.has(premiumSubscription.status)) {
        return res.status(200).json({ received: true, ignored: "subscription_not_entitled" });
      }
      const email =
        normalizeEmail(invoice.customer_email) || (await resolveEmailFromCustomerRef(invoice.customer));
      const userId = await resolveUserIdFromSubscription(premiumSubscription, email);
      const identifier: UserIdentifier | null = userId
        ? { id: userId }
        : email
          ? { email }
          : null;
      if (!identifier) return res.status(200).json({ received: true, ignored: "user_not_found" });
      const isRenewal = invoice.billing_reason === "subscription_cycle";
      await createAffiliateCommission(invoice, premiumSubscription);
      if (isRenewal) {
        const subscriptionId = stripeSubscriptionId(premiumSubscription);
        const renewalAt = stripeInvoiceRenewalAt(invoice, premiumConfig);
        if (!invoice.id || !subscriptionId || !renewalAt) {
          return res.status(200).json({ received: true, ignored: "invalid_renewal" });
        }
        const result = await grantRenewalForIdentifier(identifier, {
          invoiceId: invoice.id,
          stripeSubscriptionId: subscriptionId,
          renewalAt,
        });
        if (userId && result === "granted") {
          trackSubscriptionLifecycle(userId, "subscription_renewed", event.id, {
            billing_reason: invoice.billing_reason || undefined,
          });
        }
        return res.status(200).json({ received: true, renewal: result });
      }
      await setPremiumForIdentifier(identifier);
    }

    if (event.type === "charge.refunded") {
      const charge = event.data.object as Stripe.Charge;
      if (charge.id) await reverseAffiliateCommission(charge.id);
    }

    if (event.type === "charge.dispute.created") {
      const dispute = event.data.object as Stripe.Dispute;
      const chargeId = typeof dispute.charge === "string" ? dispute.charge : dispute.charge?.id;
      if (chargeId) await reverseAffiliateCommission(chargeId);
    }

    if (event.type === "invoice.payment_failed") {
      const invoice = event.data.object as Stripe.Invoice;
      const premiumSubscription = await premiumSubscriptionForInvoice(invoice, premiumConfig);
      if (!premiumSubscription) {
        return res.status(200).json({ received: true, ignored: "unrelated_invoice" });
      }
      if (!ENTITLED_SUBSCRIPTION_STATUSES.has(premiumSubscription.status)) {
        const customerId = stripeSubscriptionId(premiumSubscription.customer);
        const email =
          normalizeEmail(invoice.customer_email) || (await resolveEmailFromCustomerRef(invoice.customer));
        if (email) {
          await downgradePremiumByEmail(email, premiumConfig, customerId);
        }
      }
      const email =
        normalizeEmail(invoice.customer_email) || (await resolveEmailFromCustomerRef(invoice.customer));
      const userId = await resolveUserIdFromSubscription(premiumSubscription, email);
      if (userId) {
        trackSubscriptionLifecycle(userId, "subscription_payment_failed", event.id, {
          status: premiumSubscription.status,
          attempt_count: invoice.attempt_count || 0,
          billing_reason: invoice.billing_reason || undefined,
        });
        if (email && invoice.id) {
          await sendPaymentFailedNotice(
            userId,
            email,
            invoice.id,
            invoice.attempt_count || 0
          );
        }
      }
    }

    return res.status(200).json({ received: true });
  } catch (error) {
    console.error("Webhook error", error);
    return res.status(500).json({ error: "Webhook handler failed." });
  }
}
