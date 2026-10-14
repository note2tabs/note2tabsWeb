# Regional tax pricing — 2026-10-14

Keep all published amounts unchanged. New US/Canada checkouts use exclusive tax;
all other countries, including unknown locations and USD fallback markets, use
inclusive tax. This is deliberately a narrow country allowlist, not a currency
rule or an assumption that every non-European market permits excluded taxes.

## Deployment and account state

Eight new live Stripe Prices were created on the existing products. All original
Prices, subscriptions, product defaults, coupons and tax settings remain untouched.
The inclusive Prices retain all 23 fixed currency amounts; exclusive Prices have
USD and CAD. Production and preview environment variables below are configured,
with `STRIPE_REGIONAL_TAX_ENABLED=true` for preview and `false` for production.
Enable production only after confirming registrations and product classification.
Existing deployed code ignores the new Price variables.

**Collection is not fully configured:** Stripe Tax settings are active, but the
live account has zero tax registrations. No registrations were invented or added.
Actual collection requires the merchant's registration details and correct scope
(e.g. Swedish VAT/OSS, Canadian GST/HST, relevant US states). Country wealth does
not establish a collection obligation. The existing product category remains
`txcd_10000000`, General — Electronically Supplied Services. Confirm whether a
more specific software category is appropriate before relying on US tax results.

## Integration

Vercel's trusted country header chooses the advertised market and checkout Price;
its associated fixed currency is explicitly passed to Checkout so Stripe cannot
switch to a currency with a different advertised amount or price behavior. Browser
currency and tax cookies never authorize the checkout selection. IP location is
an estimate: VPN/travel and billing-country differences remain possible. Stripe
Checkout does not dynamically change a Price's tax behavior when billing country
changes. Billing address determines actual tax jurisdiction and rate, not this
market selection. If customer-selected billing-market switching is required,
implement a country selection/restart flow before broadening this rollout.

Checkout requires billing address and enables automatic tax, saving the address
for existing customers. This applies to normal and school checkouts, including
subscriptions created with coupons. Tax policy and price/currency are included
in checkout metadata/idempotency. New subscribers retain their tax price family
when changing plans, and downgrade schedule phases preserve automatic-tax status.
Legacy subscribers retain their original plan-change pricing and tax status.
Webhook recognition includes both regional families and legacy Prices.

The proxy sets a non-sensitive inclusive/exclusive display cookie; homepage and
pricing cards show translated notes. Without a location, the note is neutral
until checkout. No localized amount was reduced.

## Validation

TypeScript and the full unit/integration suite passed. Regression coverage includes
US, Canada, France, an unsupported USD market and unknown location, untrusted
browser currency, plan upgrades preserving tax family, and rendered tax notes.
Live Stripe Checkout sessions verified USD/CAD exclusive and EUR/USD inclusive,
automatic tax enabled, billing-address collection required. All four sessions
were expired without payments; no customer subscriptions were created. This
verifies configuration, not positive tax collection with missing registrations.

## Rollback

Set STRIPE_REGIONAL_TAX_ENABLED=false and redeploy to use original checkout Prices.
Retain all eight Price variables for subscription recognition and plan changes of
any subscribers created under the regional policy. Do not delete/archive original
Prices or migrate existing subscriptions. Disabling the flag is not a retroactive
tax/subscription change.

## Sources

- [Canada Competition Bureau: sales-tax exception](https://competition-bureau.canada.ca/en/deceptive-marketing-practices/drip-pricing)
- [California DOJ: government tax exception](https://www.oag.ca.gov/hiddenfees)
- [EU distance-selling price information](https://europa.eu/youreurope/business/selling-in-eu/selling-goods-services/ecommerce-distance-selling/index_en.htm)
- [Stripe tax behavior is fixed per Price/currency, not billing country](https://docs.stripe.com/tax/products-prices-tax-codes-tax-behavior)
- [Stripe Checkout tax integration](https://docs.stripe.com/tax/checkout)

## Live Price manifest

| Variable | Price | Source Price |
| --- | --- | --- |
| STRIPE_TAX_INCLUSIVE_PREMIUM_MONTHLY | price_1UQVvf4WRmrnOGtc2JjlEVI8 | price_1UMta24WRmrnOGtcB8HQ29iE |
| STRIPE_TAX_EXCLUSIVE_PREMIUM_MONTHLY | price_1UQVvg4WRmrnOGtcOYgnzLOA | price_1UMta24WRmrnOGtcB8HQ29iE |
| STRIPE_TAX_INCLUSIVE_PREMIUM_YEARLY | price_1UQVvg4WRmrnOGtcn4ppOEmu | price_1UMta34WRmrnOGtcNvtAfMrA |
| STRIPE_TAX_EXCLUSIVE_PREMIUM_YEARLY | price_1UQVvg4WRmrnOGtcOiigi1Iw | price_1UMta34WRmrnOGtcNvtAfMrA |
| STRIPE_TAX_INCLUSIVE_PRO_MONTHLY | price_1UQVvh4WRmrnOGtcnVRKHwnD | price_1UMta34WRmrnOGtci7JkKKy6 |
| STRIPE_TAX_EXCLUSIVE_PRO_MONTHLY | price_1UQVvh4WRmrnOGtcrLKpEk59 | price_1UMta34WRmrnOGtci7JkKKy6 |
| STRIPE_TAX_INCLUSIVE_PRO_YEARLY | price_1UQVvh4WRmrnOGtcpjTDNvcC | price_1UMta44WRmrnOGtcL2V3WOPg |
| STRIPE_TAX_EXCLUSIVE_PRO_YEARLY | price_1UQVvi4WRmrnOGtcrWzWEwyE | price_1UMta44WRmrnOGtcL2V3WOPg |
