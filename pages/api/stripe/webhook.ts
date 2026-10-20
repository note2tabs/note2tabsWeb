import {fulfillCreditTopUp} from "../../../lib/creditTopUps";
import {grantWalletAllowance,usesCreditWallet,activateWalletPlan} from "../../../lib/creditWallet";
import { withAffiliatePayoutLock, reverseCommissionTransfer } from "../../../lib/affiliatePayouts";
import { queuePaidCreditReset } from "../../../lib/creditResetNotices";
import { checkoutForPaymentIntent, checkoutPaymentDiagnostics, safeCheckoutPaymentDiagnostics } from "../../../lib/checkoutDiagnostics";
import { setStripeEmailLanguage } from "../../../lib/i18n/stripeEmailLanguage";
import { accountEmailLocale } from "../../../lib/i18n/accountLanguage";
import {localeCohort} from "../../../lib/i18n/locale";
import { normalizeLocale } from "../../../lib/i18n/locale";
import type { NextApiRequest, NextApiResponse } from "next";
import type Stripe from "stripe";
import { stripeClient } from "../../../lib/stripe";
import { prisma } from "../../../lib/prisma";
import {
  STARTING_CREDITS,
  capCreditBalance,
} from "../../../lib/credits";
import {
  getStripePaidPlanConfigs,
  stripeCheckoutPlan,
  stripeSubscriptionPlan,
  stripeInvoiceMatchesPremium,
  stripeInvoiceRenewalAt,
  stripeSubscriptionId,
  stripeSubscriptionMatchesPremium,
  type StripePremiumConfig,
} from "../../../lib/stripePremium";
import {
  PLAN_CATALOG,
  isPaidPlan,
  type PaidSubscriptionPlan,
} from "../../../lib/subscriptionPlans";
import {
  createPostHogServerClient,
  flushPostHogServerClientInBackground,
  stablePostHogEventUuid,
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
import { affiliateCanEarnCommission, commissionAmount } from "../../../lib/affiliate";
import { buildPaymentFailedEmail } from "../../../lib/paymentRecovery";
import { trackAffiliateEvent } from "../../../lib/affiliateTracking";
import { buildProStartedEmail } from "../../../lib/proSubscriptionEmail";

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

async function setPremiumForIdentifier(identifier: UserIdentifier, plan: PaidSubscriptionPlan = "PREMIUM") {
  const user = await prisma.user.findFirst({
    where: identifier,
    select: { id: true, role: true, subscriptionPlan: true, tokensRemaining: true },
  });
  if (!user) return null;
  if (user.role === "ADMIN" || user.role === "MODERATOR" || user.role === "MOD") {
    return null;
  }
  // A paid role on its own is not a complete activation. In particular, an
  // interrupted/racing entitlement update can leave the user with PREMIUM as
  // their role while their persisted plan and balance are still FREE. Treating
  // that state as an existing subscription would preserve the 10-credit free
  // balance instead of granting the plan allocation.
  const isAlreadyPaid = user.role === "PREMIUM" && isPaidPlan(user.subscriptionPlan);
  const definition = PLAN_CATALOG[plan];
  const tokensRemaining =
    !isAlreadyPaid
      ? definition.monthlyCredits
      : capCreditBalance(
          plan === "PRO" && user.subscriptionPlan !== "PRO"
            ? Math.max(user.tokensRemaining, definition.monthlyCredits)
            : user.tokensRemaining,
          definition.rolloverCap
        );
  if (await usesCreditWallet(user.id)) {
    await activateWalletPlan(user,plan,definition.monthlyCredits,definition.rolloverCap);
  } else {
  await prisma.user.update({
    where: { id: user.id },
    data: {
      role: "PREMIUM",
      subscriptionPlan: plan,
      tokensRemaining,
    },
  });
  }
  return user.id;
}

async function trackSubscriptionStarted(
  userId: string,
  session: Stripe.Checkout.Session,
  plan: PaidSubscriptionPlan,
  stripeEventId: string,
  occurredAt: number
) {
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
    uuid: stablePostHogEventUuid(`subscription-started:${session.id}`),
    timestamp: new Date(occurredAt * 1000),
    disableGeoip: true,
    properties: {
      environment: process.env.VERCEL_ENV || process.env.NODE_ENV || "development",
      plan: PLAN_CATALOG[plan].analyticsId,
      source: normalizePremiumFunnelSource(session.metadata?.premiumFunnelSource),
      ...localeCohort(normalizeLocale(session.metadata?.note2tabsLocale), session.metadata?.note2tabsVisitorCountry),
      device_type: session.metadata?.note2tabsDeviceType,
      reason: normalizePremiumFunnelReason(session.metadata?.premiumFunnelReason),
      funnel_id: funnelId || undefined,
      trial_included: session.metadata?.premiumTrialIncluded === "true",
      offer_variant: normalizePremiumOfferVariant(session.metadata?.premiumOfferVariant),
      model,
      checkout_session_id: session.id,
      checkout_attempt_id: session.metadata?.note2tabsCheckoutAttemptId || undefined,
      stripe_event_id: stripeEventId,
      ...checkoutCurrencyProperties(session),
      ...await checkoutPaymentDiagnostics(stripeClient!, session),
      payment_status: session.payment_status,
      amount_total_minor: session.amount_total,
      billing_interval: session.metadata?.note2tabsBillingInterval,
      browser: session.metadata?.note2tabsBrowser,
      os: session.metadata?.note2tabsOs,
      checkout_integration: session.metadata?.note2tabsCheckoutIntegration,
      event_source: "stripe_webhook",
      $insert_id: `subscription-started:${session.id}`,
    },
  });
  // Persist the immutable event before acknowledging Stripe. PostHog outages
  // retry from the outbox without rerunning payment fulfillment.
  await client.flush();
}

type SubscriptionLifecycleEvent =
  | "subscription_cancel_scheduled"
  | "subscription_cancellation_reversed"
  | "subscription_ended"
  | "subscription_payment_failed"
  | "subscription_payment_succeeded"
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

async function trackSubscriptionLifecycle(
  userId: string,
  lifecycleEvent: SubscriptionLifecycleEvent,
  stripeEventId: string,
  properties: Record<string, string | number | boolean | null | undefined> = {},
  occurredAt?: number
) {
  const stableTime = typeof occurredAt === "number" && Number.isFinite(occurredAt);
  const client = createPostHogServerClient();
  if (!client) return;
  client.capture({
    distinctId: userId,
    event: lifecycleEvent,
    uuid: stablePostHogEventUuid(`${lifecycleEvent}:${stripeEventId}`),
    timestamp: new Date(stableTime ? occurredAt! * 1000 : Date.now()),
    disableGeoip: true,
    properties: {
      environment: process.env.VERCEL_ENV || process.env.NODE_ENV || "development",
      plan: "premium_monthly",
      event_source: "stripe_webhook",
      ...properties,
      $insert_id: `${lifecycleEvent}:${stripeEventId}`,
    },
  });
  if (stableTime) await client.flush();
  else flushPostHogServerClientInBackground(client);
}

type SafePaymentFailure = {
  failure_code?: string;
  decline_code?: string;
  failure_type?: string;
};

function safePaymentFailure(error: Stripe.PaymentIntent.LastPaymentError | null | undefined): SafePaymentFailure {
  if (!error) return {};
  return {
    failure_code: typeof error.code === "string" ? error.code : undefined,
    decline_code: "decline_code" in error && typeof error.decline_code === "string"
      ? error.decline_code
      : undefined,
    failure_type: typeof error.type === "string" ? error.type : undefined,
  };
}

async function paymentFailureForReference(
  paymentIntent: string | Stripe.PaymentIntent | null | undefined
): Promise<SafePaymentFailure> {
  if (!paymentIntent) return {};
  try {
    const intent = typeof paymentIntent === "string"
      ? await stripeClient!.paymentIntents.retrieve(paymentIntent)
      : paymentIntent;
    return safePaymentFailure(intent.last_payment_error);
  } catch (error) {
    console.error("Stripe payment failure lookup failed", error);
    return {};
  }
}

function checkoutAnalyticsPlan(session: Stripe.Checkout.Session) {
  const rawPlan = session.metadata?.note2tabsPlan?.toLowerCase();
  const interval = session.metadata?.note2tabsBillingInterval === "yearly" ? "yearly" : "monthly";
  return rawPlan === "pro" || rawPlan === "premium" ? `${rawPlan}_${interval}` : undefined;
}

function checkoutCurrencyProperties(session: Stripe.Checkout.Session) {
  const localizedSession = session as Stripe.Checkout.Session & {
    adaptive_pricing?: { enabled?: boolean } | null;
    presentment_details?: { presentment_currency?: string } | null;
  };
  return {
    checkout_currency: session.currency || undefined,
    presentment_currency: localizedSession.presentment_details?.presentment_currency || undefined,
    adaptive_pricing_enabled: localizedSession.adaptive_pricing?.enabled === true,
  };
}

async function trackCheckoutLifecycle(
  session: Stripe.Checkout.Session,
  event: "checkout_abandoned" | "checkout_payment_failed" | "checkout_payment_action_required",
  stripeEventId: string,
  additionalProperties: SafePaymentFailure & Record<string, unknown> = {},
  occurredAt?: number
) {
  const identifier = await resolveUserIdentifierFromCheckoutSession(session);
  const distinctId = identifier && "id" in identifier
    ? identifier.id
    : identifier && "email" in identifier
      ? await resolveUserIdFromEmail(identifier.email)
      : null;
  if (!distinctId) return;
  const stableTime = typeof occurredAt === "number" && Number.isFinite(occurredAt);
  const client = createPostHogServerClient();
  if (!client) return;
  client.capture({
    distinctId,
    event,
    uuid: stablePostHogEventUuid(`${event}:${stripeEventId}`),
    timestamp: new Date(stableTime ? occurredAt! * 1000 : Date.now()),
    disableGeoip: true,
    properties: {
      environment: process.env.VERCEL_ENV || process.env.NODE_ENV || "development",
      checkout_session_id: session.id,
      checkout_attempt_id: session.metadata?.note2tabsCheckoutAttemptId || undefined,
      plan: checkoutAnalyticsPlan(session),
      billing_interval: session.metadata?.note2tabsBillingInterval || undefined,
      site_display_currency: session.metadata?.note2tabsDisplayCurrency || undefined,
      source: normalizePremiumFunnelSource(session.metadata?.premiumFunnelSource),
      ...localeCohort(normalizeLocale(session.metadata?.note2tabsLocale), session.metadata?.note2tabsVisitorCountry),
      device_type: session.metadata?.note2tabsDeviceType,
      reason: normalizePremiumFunnelReason(session.metadata?.premiumFunnelReason),
      funnel_id: normalizePremiumFunnelId(session.metadata?.premiumFunnelId) || undefined,
      browser: session.metadata?.note2tabsBrowser,
      os: session.metadata?.note2tabsOs,
      checkout_integration: session.metadata?.note2tabsCheckoutIntegration,
      checkout_status: session.status || undefined,
      amount_total_minor: session.amount_total,
      abandonment_observation: event === "checkout_abandoned" ? "session_expired_not_tab_closed" : undefined,
      payment_status: session.payment_status || undefined,
      ...checkoutCurrencyProperties(session),
      event_source: "stripe_webhook",
      ...additionalProperties,
      $insert_id: event === "checkout_payment_failed"
        ? `checkout-payment-failed:${stripeEventId}`
        : event === "checkout_payment_action_required"
          ? `checkout-payment-action-required:${stripeEventId}`
          : `checkout-abandoned:${session.id}`,
      stripe_event_id: stripeEventId,
    },
  });
  if (stableTime) await client.flush();
  else flushPostHogServerClientInBackground(client);
}

async function sendPremiumTrialReminder(
  userId: string,
  email: string,
  trialEnd: number,
  stripeEventId: string
) {
  if (!customPremiumTrialReminderEnabled()) return;
  const locale = await accountEmailLocale(userId);
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
    locale,
    name: user?.name,
    trialEndsAt: new Date(trialEnd * 1000),
    latestEditor: latestEditor
      ? { id: latestEditor.canvas_id, name: latestEditor.name }
      : null,
  });
  try {
    await sendTransactionalEmail({
      language:{kind:"customer",template:"trial_ending",locale,accountId:userId},
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

  const locale = await accountEmailLocale(userId, normalizeLocale(session.metadata?.note2tabsLocale));
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
    locale,
    name: user.name,
    trialStartsAt: new Date((subscription.trial_start || subscription.created) * 1000),
    trialEndsAt: new Date(subscription.trial_end * 1000),
    latestEditor: latestEditor
      ? { id: latestEditor.canvas_id, name: latestEditor.name }
      : null,
  });
  try {
    await sendTransactionalEmail({
      language:{kind:"customer",template:"trial_started",locale,accountId:userId},
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

async function sendProStartedNotice(userId: string, stripeEventId: string) {
  const locale = await accountEmailLocale(userId);
  const marker = { identifier: `notice:pro-started:${userId}`, token: `stripe-event:${stripeEventId}` };
  try {
    await prisma.verificationToken.create({
      data: { ...marker, expires: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) },
    });
  } catch (error) {
    if (prismaErrorCode(error) === "P2002") return;
    throw error;
  }
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, name: true } });
  if (!user?.email) return;
  try {
    await sendTransactionalEmail({ language:{kind:"customer",template:"pro_started",locale,accountId:userId}, to: user.email, ...buildProStartedEmail(user.name, locale) });
  } catch (error) {
    await prisma.verificationToken.deleteMany({ where: marker });
    throw error;
  }
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

async function cardFreeSchoolAccessMonths(session: Stripe.Checkout.Session) {
  if (!stripeClient || session.metadata?.note2tabsSchoolCheckout !== "true") return null;
  const expanded = await stripeClient.checkout.sessions.retrieve(session.id, {
    expand: ["total_details.breakdown.discounts.discount.promotion_code"],
  });
  const promotionId = checkoutPromotionCodeId(expanded);
  if (!promotionId) return null;
  const promotion = await stripeClient.promotionCodes.retrieve(promotionId, { expand: ["coupon"] });
  const coupon = typeof promotion.coupon === "string" ? null : promotion.coupon;
  const approved =
    promotion.active &&
    (promotion.metadata?.note2tabsCardFreeSchoolAccess === "true" ||
      coupon?.metadata?.note2tabsCardFreeSchoolAccess === "true") &&
    coupon?.valid &&
    coupon.percent_off === 100 &&
    coupon.duration === "repeating";
  const months = Number(
    promotion.metadata?.note2tabsSchoolAccessMonths ||
    coupon?.metadata?.note2tabsSchoolAccessMonths ||
    coupon?.duration_in_months
  );
  return approved && Number.isInteger(months) && months >= 1 && months <= 24 ? months : null;
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
  if (!attribution || !affiliateCanEarnCommission({
    status: attribution.affiliate.status,
    deactivatedAt: attribution.affiliate.updatedAt,
    referralCreatedAt: attribution.createdAt,
  })) return;
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

async function trackAffiliatePayment(
  invoice: Stripe.Invoice,
  subscription: Stripe.Subscription,
  userId: string,
  renewal: boolean
) {
  const attributionId = subscription.metadata?.note2tabsAffiliateAttributionId;
  const subscriptionId = stripeSubscriptionId(subscription);
  const attribution = await prisma.affiliateAttribution.findFirst({
    where: attributionId
      ? { id: attributionId }
      : subscriptionId
        ? { stripeSubscriptionId: subscriptionId }
        : { id: "" },
    include: {
      affiliate: { select: { id: true, code: true } },
      commissions: { select: { id: true } },
    },
  });
  if (!attribution || !invoice.id) return;
  await trackAffiliateEvent({
    distinctId: userId,
    event: renewal ? "affiliate_subscription_renewed" : "affiliate_payment_succeeded",
    insertId: `affiliate-payment:${invoice.id}`,
    occurredAt: new Date(invoice.created * 1000),
    properties: {
      affiliate_id: attribution.affiliate.id,
      affiliate_code: attribution.affiliate.code,
      stripe_invoice_id: invoice.id,
      stripe_subscription_id: subscriptionId || undefined,
      revenue_amount: invoice.amount_paid,
      currency: invoice.currency,
      payment_number: attribution.commissions.length,
    },
  });
}

async function trackAffiliateTrialStarted(userId: string, session: Stripe.Checkout.Session) {
  const attributionId = session.metadata?.note2tabsAffiliateAttributionId;
  if (!attributionId) return;
  const attribution = await prisma.affiliateAttribution.findUnique({
    where: { id: attributionId },
    include: { affiliate: { select: { id: true, code: true } } },
  });
  if (!attribution) return;
  await trackAffiliateEvent({
    distinctId: userId,
    event: "affiliate_trial_started",
    insertId: `affiliate-trial:${session.id}`,
    occurredAt: new Date(session.created * 1000),
    properties: {
      affiliate_id: attribution.affiliate.id,
      affiliate_code: attribution.affiliate.code,
      checkout_session_id: session.id,
    },
  });
}

async function reverseAffiliateCommission(chargeId: string) {
  const commissions = await prisma.affiliateCommission.findMany({
    where: { stripeChargeId: chargeId, status: { in: ["PENDING", "PAID"] } },
    include: {
      affiliate: { select: { id: true, code: true } },
      attribution: { select: { referredUserId: true } },
    },
  });
  for (const original of commissions) {
    if (!stripeClient) throw new Error("Stripe unavailable for affiliate refund");
    const stripe = stripeClient;
    const reversed = await withAffiliatePayoutLock(original.affiliateId, tx =>
      reverseCommissionTransfer(tx, stripe, original.id)
    );
    if (!reversed) continue;
    const commission = original;
    const { reversedAt } = reversed;
    await trackAffiliateEvent({
      distinctId: commission.attribution.referredUserId,
      event: "affiliate_payment_refunded",
      insertId: `affiliate-refund:${commission.id}`,
      occurredAt: reversedAt,
      properties: {
        affiliate_id: commission.affiliate.id,
        affiliate_code: commission.affiliate.code,
        stripe_charge_id: chargeId,
        commission_amount: commission.commissionAmount,
        currency: commission.currency,
      },
    });
  }
}

async function sendPaymentFailedNotice(
  userId: string,
  email: string,
  invoiceId: string,
  attemptCount: number,
  plan: PaidSubscriptionPlan = "PREMIUM"
) {
  // Set this to "stripe" when Stripe's own failed-payment emails are enabled,
  // so customers receive one recovery message rather than two.
  if (process.env.PAYMENT_RECOVERY_EMAIL_MODE === "stripe") return;
  if (attemptCount !== 1) return;
  const locale = await accountEmailLocale(userId);
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
  const notice = buildPaymentFailedEmail({ locale, name: user?.name, planName: PLAN_CATALOG[plan].name as "Premium" | "Pro" });
  try {
    await sendTransactionalEmail({ language:{kind:"customer",template:"payment_failed",locale,accountId:userId}, to: email, ...notice });
  } catch (error) {
    await prisma.verificationToken.deleteMany({ where: marker });
    throw error;
  }
}

type RenewalInvoiceDetails = {
  invoiceId: string;
  stripeSubscriptionId: string;
  renewalAt: Date;
  plan: PaidSubscriptionPlan;
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
            select: { id: true, role: true, subscriptionPlan: true, tokensRemaining: true },
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

          const definition = PLAN_CATALOG[renewal.plan];
          const tokensRemaining = await usesCreditWallet(user.id)
            ? await grantWalletAllowance(tx,user,definition.monthlyCredits,definition.rolloverCap)
            : user.role === "PREMIUM"
              ? capCreditBalance(user.tokensRemaining + definition.monthlyCredits, definition.rolloverCap)
              : definition.monthlyCredits;
          await tx.user.update({
            where: { id: user.id },
            data: { role: "PREMIUM", subscriptionPlan: renewal.plan, tokensRemaining },
          });
          await queuePaidCreditReset(tx, {accountId:user.id,invoiceId:renewal.invoiceId,previousBalance:user.tokensRemaining,now:new Date()});
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
  paidConfigs: StripePremiumConfig[],
  customerId?: string | null
) {
  if (customerId) {
    for (const config of paidConfigs) {
      if (await customerHasEntitledSubscription(customerId, config)) return;
    }
  }
  for (const config of paidConfigs) {
    if (await emailHasEntitledSubscription(email, config, customerId)) return;
  }

  const user = await prisma.user.findFirst({
    where: { email: email.toLowerCase() },
    select: { id: true, role: true },
  });
  if (!user || user.role !== "PREMIUM") return;
  await prisma.user.update({
    where: { id: user.id },
    data: { role: "FREE", subscriptionPlan: "FREE", tokensRemaining: STARTING_CREDITS },
  });
}

async function paidPlanForCheckoutSession(session: Stripe.Checkout.Session) {
  if (!stripeClient) return null;
  if (session.mode && session.mode !== "subscription") return null;

  const subscriptionRef = session.subscription;
  if (subscriptionRef && typeof subscriptionRef === "object") {
    const plan = stripeSubscriptionPlan(subscriptionRef);
    if (plan) return plan;
  } else if (typeof subscriptionRef === "string") {
    const subscription = await stripeClient.subscriptions.retrieve(subscriptionRef);
    const plan = stripeSubscriptionPlan(subscription);
    if (plan) return plan;
  }

  if (!session.id) return null;
  const lineItems = await stripeClient.checkout.sessions.listLineItems(session.id, { limit: 100 });
  return stripeCheckoutPlan({ ...session, line_items: lineItems } as Stripe.Checkout.Session);
}

async function paidSubscriptionForInvoice(invoice: Stripe.Invoice) {
  if (!stripeClient) return null;
  const configs = Object.values(getStripePaidPlanConfigs()).filter(
    (value): value is NonNullable<typeof value> => Boolean(value)
  );
  const matchingConfig = configs.find((config) => stripeInvoiceMatchesPremium(invoice, config));
  const matchingLine = invoice.lines?.data?.find((line) =>
    matchingConfig && stripeInvoiceMatchesPremium({ lines: { data: [line] } } as Stripe.Invoice, matchingConfig)
  );
  const subscriptionRef = invoice.subscription || matchingLine?.subscription || null;
  if (!subscriptionRef) return null;
  const subscription =
    typeof subscriptionRef === "string"
      ? await stripeClient.subscriptions.retrieve(subscriptionRef)
      : subscriptionRef;
  const plan = stripeSubscriptionPlan(subscription);
  if (!plan) return null;
  const config = getStripePaidPlanConfigs()[plan];
  if (!config || (invoice.lines?.data?.length && !stripeInvoiceMatchesPremium(invoice, config))) return null;
  return { subscription, plan, config };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ error: "Method not allowed" });
  }

  const paidConfigs = Object.values(getStripePaidPlanConfigs()).filter(
    (value): value is NonNullable<typeof value> => Boolean(value)
  );
  if (!stripeClient || !process.env.STRIPE_WEBHOOK_SECRET || paidConfigs.length === 0) {
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
    if (["checkout.session.completed","checkout.session.async_payment_succeeded"].includes(event.type)) {
      const topUpSession=event.data.object as Stripe.Checkout.Session;
      if (topUpSession.metadata?.creditTopUpOrderId) {
        const fresh=await stripeClient.checkout.sessions.retrieve(topUpSession.id,{expand:["payment_intent.latest_charge"]});
        await fulfillCreditTopUp(fresh);
        return res.status(200).json({received:true});
      }
    }
    if (event.type === "charge.refunded") {
      const charge=event.data.object as Stripe.Charge;
      const paymentId=typeof charge.payment_intent==='string'?charge.payment_intent:charge.payment_intent?.id;
      if (paymentId) {
        const intent=await stripeClient.paymentIntents.retrieve(paymentId);
        const orderId=intent.metadata?.creditTopUpOrderId;
        if(orderId){
          const order=await prisma.creditTopUpOrder.findUnique({where:{id:orderId}});
          if(order?.checkoutSessionId) await fulfillCreditTopUp(await stripeClient.checkout.sessions.retrieve(order.checkoutSessionId,{expand:["payment_intent.latest_charge"]}));
          return res.status(200).json({received:true});
        }
      }
    }

    if (event.type === "checkout.session.expired") {
      const checkoutSession = event.data.object as Stripe.Checkout.Session;
      if (checkoutSession.metadata?.userId && checkoutSession.metadata?.note2tabsPlan) {
        await trackCheckoutLifecycle(checkoutSession, "checkout_abandoned", event.id, {}, event.created);
      }
    }

    if (event.type === "checkout.session.async_payment_failed") {
      const checkoutSession = event.data.object as Stripe.Checkout.Session;
      if (checkoutSession.metadata?.userId && checkoutSession.metadata?.note2tabsPlan) {
        const failure = await paymentFailureForReference(checkoutSession.payment_intent);
        await trackCheckoutLifecycle(checkoutSession, "checkout_payment_failed", event.id, failure, event.created);
      }
    }

    if (event.type === "payment_intent.payment_failed" || event.type === "payment_intent.requires_action") {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      const checkoutSession = await checkoutForPaymentIntent(stripeClient, paymentIntent);
      if (checkoutSession?.metadata?.userId && checkoutSession.metadata?.note2tabsPlan) {
        await trackCheckoutLifecycle(
          checkoutSession,
          event.type === "payment_intent.requires_action" ? "checkout_payment_action_required" : "checkout_payment_failed",
          event.id,
          {...safePaymentFailure(paymentIntent.last_payment_error), ...safeCheckoutPaymentDiagnostics(paymentIntent)},
          event.created
        );
      }
    }

    if (event.type === "checkout.session.completed") {
      const checkoutSession = event.data.object as Stripe.Checkout.Session;
      const plan = await paidPlanForCheckoutSession(checkoutSession);
      if (!plan) {
        return res.status(200).json({ received: true, ignored: "unrelated_checkout" });
      }
      if (checkoutSession.metadata?.note2tabsSchoolCheckout === "true") {
        const months = await cardFreeSchoolAccessMonths(checkoutSession);
        if (months && typeof checkoutSession.subscription === "string") {
          const subscription = await stripeClient.subscriptions.retrieve(checkoutSession.subscription);
          const end = new Date(subscription.current_period_start * 1000);
          end.setUTCMonth(end.getUTCMonth() + months);
          await stripeClient.subscriptions.update(subscription.id, {
            cancel_at: Math.floor(end.getTime() / 1000),
            metadata: {
              ...subscription.metadata,
              note2tabsCardFreeSchoolAccess: "true",
              note2tabsSchoolAccessMonths: String(months),
            },
          });
        }
      }
      const identifier = await resolveUserIdentifierFromCheckoutSession(checkoutSession);
      if (identifier) {
        const userId = await setPremiumForIdentifier(identifier, plan);
        if (userId) {
          if (checkoutSession.customer) {
            const customerId = typeof checkoutSession.customer === "string" ? checkoutSession.customer : checkoutSession.customer.id;
            try { await setStripeEmailLanguage(customerId, await accountEmailLocale(userId, normalizeLocale(checkoutSession.metadata?.note2tabsLocale))); }
            catch { console.warn("stripe_email_language_sync_failed"); }
          }
          if (Number.isFinite(event.created)) {
            await trackSubscriptionStarted(userId, checkoutSession, plan, event.id, event.created);
          } else {
            console.error("stripe_analytics_missing_event_timestamp");
          }
          await persistAffiliateAttribution(checkoutSession, userId);
          if (plan === "PREMIUM" && checkoutSession.metadata?.premiumTrialIncluded === "true") {
            await trackAffiliateTrialStarted(userId, checkoutSession);
          }
          if (plan === "PREMIUM") try {
            await sendPremiumTrialStartedNotice(userId, checkoutSession, event.id);
          } catch (error) {
            console.error("Premium trial started notice delivery failed", { userId, error });
          }
          if (plan === "PRO") try {
            await sendProStartedNotice(userId, event.id);
          } catch (error) {
            console.error("Pro started notice delivery failed", { userId, error });
          }
        }
      }
    }

    if (event.type === "customer.subscription.deleted") {
      const subscription = event.data.object as Stripe.Subscription;
      const plan = stripeSubscriptionPlan(subscription);
      if (!plan) {
        return res.status(200).json({ received: true, ignored: "unrelated_subscription" });
      }
      const email = await resolveEmailFromCustomerRef(subscription.customer);
      const userId = await resolveUserIdFromSubscription(subscription, email);
      if (userId) {
        await trackSubscriptionLifecycle(userId, "subscription_ended", event.id, {
          status: subscription.status,
          plan: PLAN_CATALOG[plan].analyticsId,
          cancellation_reason: subscription.cancellation_details?.reason || undefined,
          cancellation_feedback: subscription.cancellation_details?.feedback || undefined,
        }, event.created);
      }
      if (email) {
        await downgradePremiumByEmail(
          email,
          paidConfigs,
          stripeSubscriptionId(subscription.customer)
        );
      }
    }

    if (event.type === "customer.subscription.updated") {
      const subscription = event.data.object as Stripe.Subscription;
      const plan = stripeSubscriptionPlan(subscription);
      if (!plan) {
        return res.status(200).json({ received: true, ignored: "unrelated_subscription" });
      }
      const email = await resolveEmailFromCustomerRef(subscription.customer);
      const userId = await resolveUserIdFromSubscription(subscription, email);
      const previous = event.data.previous_attributes as
        | Partial<Stripe.Subscription>
        | undefined;
      if (userId && previous && "cancel_at_period_end" in previous) {
        await trackSubscriptionLifecycle(
          userId,
          subscription.cancel_at_period_end
            ? "subscription_cancel_scheduled"
            : "subscription_cancellation_reversed",
          event.id,
          {
            status: subscription.status,
            plan: PLAN_CATALOG[plan].analyticsId,
            trial: subscription.status === "trialing",
            days_remaining: unixDaysRemaining(
              subscription.cancel_at || subscription.trial_end || subscription.current_period_end
            ),
            cancellation_reason: subscription.cancellation_details?.reason || undefined,
            cancellation_feedback: subscription.cancellation_details?.feedback || undefined,
          },
          event.created
        );
      }
      if (ENTITLED_SUBSCRIPTION_STATUSES.has(subscription.status)) {
        if (userId) await setPremiumForIdentifier({ id: userId }, plan);
        else if (email) await setPremiumForIdentifier({ email }, plan);
      }
      if (email && REVOKED_SUBSCRIPTION_STATUSES.has(subscription.status)) {
        await downgradePremiumByEmail(
          email,
          paidConfigs,
          stripeSubscriptionId(subscription.customer)
        );
      }
    }

    if (event.type === "customer.subscription.trial_will_end") {
      const subscription = event.data.object as Stripe.Subscription;
      const plan = stripeSubscriptionPlan(subscription);
      if (plan !== "PREMIUM") {
        return res.status(200).json({ received: true, ignored: "unrelated_subscription" });
      }
      const email = await resolveEmailFromCustomerRef(subscription.customer);
      const userId = await resolveUserIdFromSubscription(subscription, email);
      if (userId) {
        await trackSubscriptionLifecycle(userId, "subscription_trial_ending", event.id, {
          status: subscription.status,
          plan: PLAN_CATALOG[plan].analyticsId,
          days_remaining: unixDaysRemaining(subscription.trial_end),
          cancel_at_period_end: subscription.cancel_at_period_end,
        }, event.created);
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
      const paidSubscription = await paidSubscriptionForInvoice(invoice);
      if (!paidSubscription) {
        return res.status(200).json({ received: true, ignored: "unrelated_invoice" });
      }
      const { subscription: premiumSubscription, plan, config: paidConfig } = paidSubscription;
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
      if (userId && invoice.amount_paid > 0) {
        await trackSubscriptionLifecycle(userId, "subscription_payment_succeeded", event.id, {
          ...localeCohort(normalizeLocale(premiumSubscription.metadata?.note2tabsLocale), premiumSubscription.metadata?.note2tabsVisitorCountry),
          device_type: premiumSubscription.metadata?.note2tabsDeviceType,
          billing_interval: premiumSubscription.metadata?.note2tabsBillingInterval,
          plan: PLAN_CATALOG[plan].analyticsId,
          amount_paid_minor: invoice.amount_paid,
          currency: invoice.currency,
          billing_reason: invoice.billing_reason,
          stripe_invoice_id: invoice.id,
          is_renewal: isRenewal,
        }, event.created);
      }
      await createAffiliateCommission(invoice, premiumSubscription);
      if (userId) await trackAffiliatePayment(invoice, premiumSubscription, userId, isRenewal);
      if (isRenewal) {
        const subscriptionId = stripeSubscriptionId(premiumSubscription);
        const renewalAt = stripeInvoiceRenewalAt(invoice, paidConfig);
        if (!invoice.id || !subscriptionId || !renewalAt) {
          return res.status(200).json({ received: true, ignored: "invalid_renewal" });
        }
        const result = await grantRenewalForIdentifier(identifier, {
          invoiceId: invoice.id,
          stripeSubscriptionId: subscriptionId,
          renewalAt,
          plan,
        });
        if (userId && result === "granted") {
          await trackSubscriptionLifecycle(userId, "subscription_renewed", event.id, {
            billing_reason: invoice.billing_reason || undefined,
            plan: PLAN_CATALOG[plan].analyticsId,
          }, event.created);
        }
        return res.status(200).json({ received: true, renewal: result });
      }
      await setPremiumForIdentifier(identifier, plan);
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
      const paidSubscription = await paidSubscriptionForInvoice(invoice);
      if (!paidSubscription) {
        return res.status(200).json({ received: true, ignored: "unrelated_invoice" });
      }
      const { subscription: premiumSubscription, plan } = paidSubscription;
      if (!ENTITLED_SUBSCRIPTION_STATUSES.has(premiumSubscription.status)) {
        const customerId = stripeSubscriptionId(premiumSubscription.customer);
        const email =
          normalizeEmail(invoice.customer_email) || (await resolveEmailFromCustomerRef(invoice.customer));
        if (email) {
          await downgradePremiumByEmail(email, paidConfigs, customerId);
        }
      }
      const email =
        normalizeEmail(invoice.customer_email) || (await resolveEmailFromCustomerRef(invoice.customer));
      const userId = await resolveUserIdFromSubscription(premiumSubscription, email);
      if (userId) {
        const failure = await paymentFailureForReference(invoice.payment_intent);
        await trackSubscriptionLifecycle(userId, "subscription_payment_failed", event.id, {
          status: premiumSubscription.status,
          attempt_count: invoice.attempt_count || 0,
          billing_reason: invoice.billing_reason || undefined,
          plan: PLAN_CATALOG[plan].analyticsId,
          ...failure,
        }, event.created);
        if (email && invoice.id) {
          await sendPaymentFailedNotice(
            userId,
            email,
            invoice.id,
            invoice.attempt_count || 0,
            plan
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
