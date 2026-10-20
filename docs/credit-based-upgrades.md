# Monthly Premium → monthly Pro credit exchange

Isolated branch; not released. Annual upgrades retain the existing flow.

The first Pro month costs the actual Pro recurring price in the subscriber's existing currency, less remaining credits × the actual Premium monthly price / 100. Rollover counts. Round once to currency minor units; floor the charge at zero. Credits are exchanged, not retained alongside the discount. The balance becomes 250, less any credits spent while payment is pending. Regular Pro billing resumes one month after the upgrade. The review shows the full Pro price; any existing Premium coupon is replaced with the one-invoice exchange discount. Existing tax configuration is preserved; no new tax registration or collection is enabled.

The customer reviews the price before confirming. The server recomputes an unsaved quote to reject stale balances. An immutable record per subscription period, Stripe idempotency keys, and row-locked fulfillment prevent repeated charges/grants. The signed subscription/invoice webhooks and synchronous payment response use the same fulfillment operation. Payment requiring authentication redirects to Stripe's hosted invoice; Premium remains in place until paid.

Scheduled/canceling, trialing, delinquent, multi-item and manually invoiced subscriptions require review instead of silently changing their economics. The backend debit wallet must exist. Missing/invalid currency pricing fails closed.

## Release

1. Review code and apply `20261020190000_credit_upgrade` to the shared frontend/backend database before enabling.
2. Deploy with `CREDIT_UPGRADE_WEBHOOKS_ENABLED=true` so existing exchanges can always settle.
3. Enable `CREDIT_UPGRADE_ENABLED=true` to offer the new quote/confirm flow. Disable this flag to stop new exchanges; retain the webhook flag until all pending upgrades have settled/expired.
4. Verify a designated test account in Stripe test mode. Do not charge customers as a smoke test.

## Verification

`npx vitest run tests/unit/creditUpgradePricing.test.ts tests/integration/stripe-premium-flow.test.ts`

Disposable PostgreSQL only: set `CREDIT_UPGRADE_TEST_DATABASE_URL` to a local database named `n2t_upgrade_test`, push the schema, then run `tests/integration/credit-upgrade.test.ts`. Tests include concurrent fulfillment, rollover valuation, stale confirmation and pending payments.

Stripe API compatibility stays at the application's pinned 2024-06-20 version. Real Stripe test-clock validation must use that version too. No production subscription, price or payment has been changed.

Real Stripe verification: `CREDIT_UPGRADE_STRIPE_TEST=1 node scripts/verify-credit-upgrade-stripe-testmode.cjs`. Uses test-mode CLI authentication and API 2024-06-20; checks declined payment retains Premium, successful retry, and full-price next renewal. Deletes its test clock/customer/subscription afterward.

The shared credit-sync helpers now take the plan cap explicitly: Premium 200, Pro 500. This prevents reads/settings/transcription submissions from clipping a new Pro allocation to 200.

## Verified on 2026-10-20

- 191 focused tests passed across pricing, credits, transcription, subscription billing, and isolated PostgreSQL upgrade tests.
- Production Next.js build and TypeScript checks passed; migration SQL validated in a disposable schema.
- Stripe test mode (API 2024-06-20): 200 rollover credits gave a $3.01 first invoice; a decline retained Premium; paying the invoice activated Pro; the next monthly invoice was paid at $14.99.
- Browser review checked amounts, confirmation layout, Cancel, Escape, and focus restoration. All dialog messages/placeholders exist in all ten locale catalogs.
- No production deployment, migration, billing changes or merge performed.

## Subscriber entry points

The Pro card on pricing now loads a read-only server quote and displays the first-month charge, regular renewal, and credit exchange. The existing payment review follows its upgrade button. Premium subscribers' limit dialogs use the same quote and can confirm the existing subscription directly, preserving the selected transcription. Unsupported/annual quote requests return no offer and never execute a plan change.

Development-only visual review: `/dev/pro-upgrade?view=pricing`, or `?view=popup&reason=file_size_limit`, `youtube_duration_limit`, `credits_low`. These render the actual pricing/transcriber and dialog components with a synthetic Premium account. Payments are blocked; the route returns 404 outside development. The sample uses 200 remaining credits for file/YouTube limits and 3 for the credit shortfall.

Entry-point checks: 166 focused tests and TypeScript passed; browser verified all three limit states, pricing review, and preview payment blocking. Nothing merged or enabled on production.
