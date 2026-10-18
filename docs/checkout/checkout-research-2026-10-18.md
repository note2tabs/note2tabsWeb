# Stripe Checkout audit — 18 October 2026

## Scope and result

Reviewed the live hosted subscription Checkout on the owner's Chrome/Mac, live payment-method configuration, webhook subscriptions, recent payment events, account branding, existing cancellation feedback, and current Stripe documentation. Opened one owner test session without entering a payment method or submitting a payment. It remains unpaid, created no Stripe Customer, and is tagged `note2tabsInternalTest=checkout_audit_20261018`. Exclude that session from research cohorts. No customer session was changed.

The pricing page, live payment-method preferences, account branding, Stripe API version, prices, and billing behavior are unchanged. This branch adds prospective diagnostic context and a payment-action event, not a new checkout UI.

## Google Pay on this Mac

Live default payment configuration marks Google Pay, Apple Pay, Amazon Pay, cards and Link available and on. PayPal is configured on but **unavailable**: preference is not eligibility. Our checkout code uses dynamic methods rather than a hardcoded list. The observed SEK checkout has no automatic tax enabled, so Stripe Tax's documented Google Pay address limitation does not explain this case.

Reproduced Apple Pay, Link and Amazon Pay appearing without Google Pay in the owner's Chrome profile. The owner reports never having used Google Pay and probably not having a saved wallet card. This is consistent with Stripe's wallet/device eligibility requirements; it is not proof of a global integration fault. At least one real payment this week succeeded with `card.wallet.type=google_pay`, independently confirming live support. No wallet/card settings were changed and no Google Pay setup was attempted.

Stripe also documents a payment-method carousel presentation for Sweden/Finland when non-card methods are available. Wallet presentation and ordering are not a simple country-to-button mapping. An enabled method does not necessarily render for every browser or amount.

Sources: [wallet rendering requirements](https://docs.stripe.com/testing/wallets), [Google Pay](https://docs.stripe.com/google-pay), [Amazon Pay](https://docs.stripe.com/payments/amazon-pay).

## What tracking already exists

- Server-side Checkout Session requested/created events with account, funnel, session, plan, locale, country, currency and device context.
- Client redirect and cancel-return events.
- An optional localized one-click cancellation questionnaire (price, not ready, payment problem, coupon problem, unsure plan, other). Reuse it; do not add a duplicate popup.
- Signed Stripe webhooks for completed and expired sessions, asynchronous payment failure, PaymentIntent failure, invoice payments and subscription lifecycle.
- Durable PostHog outbox and stable event UUIDs.
- Recordings of the Note2Tabs lead-in/return when existing replay eligibility permits. They do not extend into Stripe's hosted origin.

## Added in this branch

1. Coarse browser/OS and `hosted_subscription_v1` integration metadata on newly created sessions and correlated outcomes. Raw user agents are not added to Stripe metadata or new events. Correct iOS-versus-macOS classification and Chrome-on-iOS recognition in the existing UA parser.
2. Session creation records configured payment-method **types**, amount in minor units, promotion-code permission and billing-address policy. These are configuration facts, not a claim that specific wallet buttons rendered. Google Pay is normally a card wallet, not a distinct `payment_method_types` entry.
3. Successful subscription activation is enriched with the actual payment-method category, card-wallet category and 3DS outcome when Stripe provides them. Missing enrichment is explicit and must not interfere with fulfillment. Activation remains distinct from invoice-paid revenue; a trial/setup is not a paid sale.
4. `checkout_payment_action_required` handles `payment_intent.requires_action`. The next-action type distinguishes a Pix QR code from SDK-based authentication. This event is a pending step, not abandonment or failure. It requires adding the event to the production webhook subscription **after deployment**.
5. Initial-invoice correlation fallback when direct PaymentIntent-to-session lookup is empty. Renewal invoices are deliberately excluded from acquisition-checkout attribution. Read-only production checks found all four recent initial actions directly linkable; fallback is defensive coverage, not a claim that those four events failed correlation.
6. Distinct Stripe failure events have distinct insert IDs, while redeliveries retain stable UUID/insert IDs. Count unique Checkout Session IDs for a session failure rate; raw failure-event counts measure events and may include multiple notifications/attempts.
7. Expiry explicitly says `session_expired_not_tab_closed`. Server session creation explicitly says it is not proof of page load. No attempt is made to infer purchase intent, tab closure or price objection from either event.

Only allowlisted categories are extracted from Stripe objects: status, method type, wallet type, authentication flow/result and next-action type, plus existing safe failure codes. No PAN, CVC, last four digits, payer name, billing address, raw error message or complete payment object is sent through the new diagnostics.

## What we learned about recent failures

For the read-only account-wide event window from 12 October through the audit, Stripe returned four `payment_intent.requires_action` events, four initial `invoice.payment_failed` events, and no `payment_intent.payment_failed` events. The original actions were three `use_stripe_sdk` and one `pix_display_qr_code`. All four intents eventually succeeded. Those events therefore do not establish four lost sales; the invoice event name alone is insufficient to diagnose a terminal decline.

The Checkout Performance UI was accessible and showed 9 loaded sessions, 5 completion attempts and 5 completions for its selected last-seven-days view. The Sessions API returned a different, larger created-session cohort. These counts have different semantics, reporting coverage and potentially freshness; the current Checkout Studio documentation also limits load/conversion metrics by revenue/integration scope. Reconcile its subscription coverage before using it as an exhaustive per-user funnel. Our earlier five paid out of 26 **created** sessions is not a measured conversion rate among customers who actually loaded the checkout form.

See [Checkout Studio analytics](https://docs.stripe.com/payments/checkout-studio/analytics) and [payment acceptance/authentication analytics](https://docs.stripe.com/payments/analytics). Report aggregates do not explain an individual silent abandonment.

## Optimizations in priority order

### 1. Keep eligible express wallets and fix availability gaps

Do not disable Amazon Pay merely because the owner does not use it; it can use saved customer details. Preserve dynamic methods and Link. Verify representative device/currency combinations with genuinely eligible wallets. PayPal's unavailable status needs an eligibility/onboarding investigation before promising it to customers. Do not enable single-use methods as though they automatically supported recurring subscription renewal. Stripe describes Swish as single-use; adding subscription support is not just turning on its toggle.

### 2. Complete business branding and support identity

The live account has a business name but no branding logo/icon, no custom primary colour and no business-profile support email or support URL. Configure the existing Note2Tabs identity and verified support contact, with a preview, rather than add promotional paragraphs. This is a concrete configuration opportunity; a conversion uplift is a hypothesis, not measured here. No live branding settings were changed in this audit.

### 3. Keep the form minimal

The observed card flow asks for card details, cardholder name and country. It does not ask for a street address, shipping address or phone. Email is already populated. Much of the standard form simplification is already present. Do not add custom questions, mandatory marketing consent or full address collection for analytics. Keep necessary collection driven by payment/tax obligations rather than remove required payment fields.

### 4. Evaluate promotion-code entry

Generic sessions currently allow promotion codes and the owner checkout exposed that entry. Baymard observed shoppers leaving checkout to hunt for coupons. A possible experiment is to reduce generic promo prominence while preserving real affiliate/coupon redemption. Do not globally remove the ability to redeem valid issued codes. Do not add a new discount to mask an unidentified issue.

Sources: [form-field research](https://baymard.com/research-articles/checkout-flow-average-form-fields), [payment UX](https://baymard.com/blog/payment-ux). These are retail usability findings, not a measured explanation for Note2Tabs abandonment.

### 5. Plan a separate Stripe API upgrade

Our application pins API `2024-06-20`; the webhook endpoint uses `2025-11-17.clover`. Stripe documents a later subscription Checkout change that improves latency and permits updates after a failed attempt that older behavior could block. This is a worthwhile integration project, but not a safe one-line change: invoice, subscription-creation timing, webhook fields, affiliate fulfillment and retry flows need testing. No API-version change is included here.

Source: [subscription Checkout upgrade](https://docs.stripe.com/changelog/basil/2025-03-31/checkout-legacy-subscription-upgrade).

### 6. Stay hosted until a measured limitation justifies migration

We cannot inject PostHog into `checkout.stripe.com` or inspect its payment fields from Note2Tabs. A custom domain alone does not grant script access. Stripe has Embedded Checkout analytics in private preview, including rendered/submitted/submit-failed events; it is not a generally available switch for our hosted integration. Do not migrate solely to promise full replay: embedded Stripe payment frames also remain protected. A supported Elements/custom flow can expose more lifecycle callbacks, but adds engineering, payment-state and QA responsibilities. Request/confirm preview access and subscription coverage before proposing migration.

Source: [Embedded Checkout analytics preview](https://docs.stripe.com/payments/checkout/embedded-analytics). Stripe’s [GA4 funnel guide](https://docs.stripe.com/payments/checkout/analyze-conversion-funnel?payment-ui=stripe-hosted) instruments the merchant site, redirects and completion events; it does not grant visibility into hosted payment fields. Adding GA4 would not solve that visibility gap.

## Measuring improvement

Use actual loaded-session counts where supported, and clearly label server-created sessions otherwise. Separate new subscription acquisition from automatic renewals, plan switches, trials and school/free access. Match session IDs and actual invoice-paid outcomes. Allow a completion window, avoid judging still-open sessions as abandoned, and exclude owner/test sessions. Segment by country, locale, currency, browser/OS and plan only when the groups have enough observations. Track wallet **usage** from payment outcomes; do not infer wallet **visibility** from configured methods.

Classify each flow using positive evidence: completed/paid; explicit return with optional stated reason; payment failure code; required action with later outcome; expired without an observed reason. Unknown remains unknown. A shopper who closes the tab without attempting payment may provide no observable reason.

Preserve existing offer/engagement experiment assignment. Test one checkout change at a time where practical, with completed purchases as the primary outcome and revenue, cancellations/refunds and payment errors as guardrails. More clicks or more reported activity are not themselves an improvement.

## Rollout and validation

Focused tests cover renewal exclusion, subscription invoice correlation, successful wallet extraction, failure of enrichment, privacy allowlisting, browser classification, action-versus-failure distinction and retry identity. All 106 focused tests passed across four files. TypeScript and the production build also passed.

After code release, preserve every existing webhook event and add only `payment_intent.requires_action` to the same signed production endpoint. Verify the saved configuration. No schema migration is needed. Existing checkout reports: https://eu.posthog.com/project/208789/insights/1xdhqdDD . Add the new diagnostics to existing checkout reporting when events are available, rather than create empty duplicate dashboards. Account-level native report: https://dashboard.stripe.com/checkout/performance .

This branch is not yet merged/deployed. New properties and the required-action event are not claimed live. Existing lifecycle tracking continues. No new customer email, payment attempt or subscription was triggered by this audit.
