# Stripe local-currency checkout

Note2Tabs keeps USD as the default subscription currency and configures fixed
local prices on the existing Stripe Prices. Stripe Checkout uses the
customer's checkout location to select an eligible currency; Note2Tabs does
not persist IP addresses or trust a browser-supplied country.

Vercel supplies `x-vercel-ip-country` at the edge for the homepage and pricing
page. The proxy converts it immediately to a 30-day `n2t_currency` cookie that
contains only a supported ISO currency code. The country and IP are not written
to that cookie. Public pricing cards read the preference after page load and
display the same fixed values configured in Stripe.

Configured live prices as of 2026-10-04:

| Plan | USD | GBP | EUR | SEK | CAD | AUD | NZD | CHF | NOK | DKK | JPY | SGD |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Premium monthly | $5.99 | £4.99 | €5.49 | 59 kr | CA$8.99 | A$8.99 | NZ$10.99 | CHF 4.99 | 59 kr | 39 kr | ¥999 | S$8.49 |
| Premium yearly | $59.99 | £49.99 | €54.99 | 599 kr | CA$85.99 | A$89.99 | NZ$109.99 | CHF 49.99 | 599 kr | 399 kr | ¥9,999 | S$84.99 |
| Pro monthly | $14.99 | £11.99 | €13.99 | 149 kr | CA$21.99 | A$21.99 | NZ$26.99 | CHF 12.49 | 149 kr | 99 kr | ¥2,499 | S$20.99 |
| Pro yearly | $149.99 | £119.99 | €139.99 | 1,499 kr | CA$214.99 | A$219.99 | NZ$269.99 | CHF 124.99 | 1,499 kr | 999 kr | ¥24,999 | S$209.99 |

Localized prices use the ECB reference cross-rates from 2026-10-02 as their
baseline, then apply customer-friendly endings. SEK and DKK deliberately use
ending-in-9 commercial prices. JPY includes an additional exchange-rate buffer
for its higher recent volatility. These are fixed prices rather than live
conversions; review them periodically if exchange rates move materially.

USD remains the fallback outside configured regions. Existing subscribers
remain on their current subscription currency. New Checkout sessions can use
the local alternatives.

PostHog receives `checkout_currency`, `presentment_currency` when supplied by
Stripe, and `adaptive_pricing_enabled` on Stripe webhook events. These
properties contain currency codes only, not addresses, IPs, card data, or
payment details.

To roll back, remove or disable the added currency options in Stripe's Product
catalogue for the four Note2Tabs recurring Prices. No application deployment
or database migration is required to revert the Stripe configuration. Revert
the localized-pricing application commit separately to restore USD-only cards.
