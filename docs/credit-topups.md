# Credit top-ups — held branch

Not merged or released. Both sale switches default to false. No live database migration, Stripe product, charge, or configuration change was made.

## Balance behavior

There is one balance in the backend's existing `user_credits` table. `User.tokensRemaining` is a mirror; the old frontend recalculation must not overwrite it for wallet-enabled users.

- Purchases add to the balance without the subscription rollover cap.
- Paid monthly allowance: `max(balance, min(rolloverCap, balance + monthlyAllowance))`.
- Premium at 230 stays at 230 on renewal; at 180 it becomes 200; at 40 it becomes 140.
- Free monthly refresh: `max(balance, 10)`. A Free balance of 40 stays 40; a balance of 2 becomes 10.
- Balances remain across renewals and downgrades. Credits are consumed normally.
- Turning off new purchases does not return existing wallet users to the old capped/resetting paths.
- Buying credits does not change subscription, model eligibility, file size, or YouTube limits.

Pricing is USD, inclusive: 15/$1.49, 30/$2.49, 45/$3.49, then $1 per further 15. No regional prices, tax registrations, discounts, or recurring purchases are added.

## Fulfillment

Only the signed Stripe webhook fulfills orders, after retrieving a fresh Checkout session and checking payment status, order/session ownership, currency, and exact amount. Completion and delayed-success events share the same idempotent wallet transaction. The browser return page only polls order status. The backend debit and fulfillment lock the same database row.

Refund events retrieve the latest payment state and revoke proportional credits, monotonically and idempotently. Revocation is limited to the available balance; already consumed service does not create negative credit debt. Chargeback/dispute handling remains a separate release consideration.

## Before release

1. Review this branch; keep it unmerged until requested.
2. Apply `20261020030000_credit_topups` with the normal migration process before serving this code, even if sales remain disabled. It adds order/state tables and retains the existing backend wallet.
3. Configure a dedicated Stripe credit product in the intended environment via `STRIPE_CREDIT_TOPUP_PRODUCT_ID`. The TEST-only product created for parameter validation is `prod_VTdIKonGxtVbNE`; never use that ID with live keys.
4. Ensure the existing signed webhook receives `checkout.session.completed`, `checkout.session.async_payment_succeeded`, and `charge.refunded`.
5. Complete an end-to-end Stripe test-mode payment through the application, including delayed success/refund and subscription activation/renewal. A completed test-mode Checkout, signed-handler fulfillment, duplicate delivery and refund verification are recorded below. No production payment test has been performed.
6. Enable both `CREDIT_TOPUPS_ENABLED` and `NEXT_PUBLIC_CREDIT_TOPUPS_ENABLED` together. Turning sales off later preserves accounts with wallet state; do not roll back to pre-wallet code after selling credits without a balance-preserving migration.

## Validation

- 162 focused pricing, checkout, transcription, and existing subscription-flow tests passed.
- Eight real local PostgreSQL tests passed: concurrent duplicate fulfillment, unpaid/mismatched payments, backend debit persistence, monthly refresh, over-cap rollover, refund reordering, sale-switch disablement, and concurrent paid activation.
- TypeScript and production build checked. No live database was used.
- Browser checked 15/30/45 prices, invalid increments, French copy, and Arabic RTL. All new strings have entries in the nine translated catalogs. Browser language preferences apply normally.

## Readiness review — October 20

The new low-credit dialog offers a one-time credit purchase to subscribers, with a secondary plan comparison for Premium and no unnecessary subscription offer for Pro. Positive low balances remain nonblocking; blocked requests or zero balance can open it. File/model limits keep their subscription offers. Balance/settings links appear only for a low paid balance (10 or less) or a genuine blocked attempt. Free accounts retain the ability to purchase directly, without routine low-balance sales prompts.

Completed a real Stripe TEST Checkout for $2.49 through the application checkout handler against isolated PostgreSQL. Entered Stripe's simulated card in hosted Checkout, verified the paid session, rejected an invalid webhook signature, processed signed completion and delayed-success deliveries through the actual webhook handler, verified exactly 30 credits added to a Free account (10 → 40), and verified owner status. Issued a test-mode refund and verified signed refund delivery restored the balance to 10 once. This verifies the integration boundaries with test-generated webhook signatures; it is not a production webhook-delivery test.

The migration SQL was applied with ON_ERROR_STOP in disposable PostgreSQL while retaining the existing backend wallet table. Eight real PostgreSQL wallet tests passed afterward. The branch's payment/credits/UI regression tests pass. TypeScript and optimized build checked.

Full-suite comparison: main had 33 failing tests; this branch initially exposed three old credit mocks without the new state-table lookup. Updated those mocks and filled missing English source catalog entries. The remaining 15 failures are reproducible on main: ten editor-design localization cases, four older localization wrapper assertions missing `initialPricingMarket`, and one practice-mode source assertion. No branch-specific failure remains in the compared run. Do not describe the whole repository suite as green.

Release remains deliberately disabled and unmerged. Before activation: apply the migration on production, provision a live-mode product, configure its ID and both sale flags, verify the required existing webhook subscriptions, and verify deployment. No production data/Stripe configuration was changed. The preview review mode is available only in development or an explicitly flagged Vercel preview with Stripe disabled; it supplies visual sample props, never API authentication.
