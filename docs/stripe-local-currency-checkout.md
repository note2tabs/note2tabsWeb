# Stripe local-currency checkout

Note2Tabs keeps USD as the default subscription currency and configures fixed
local prices on the existing Stripe Prices. Stripe Checkout uses the
customer's checkout location to select an eligible currency; Note2Tabs does
not persist IP addresses or trust a browser-supplied country.

Configured live prices as of 2026-10-03:

| Plan | USD | GBP | EUR | SEK |
| --- | ---: | ---: | ---: | ---: |
| Premium monthly | $5.99 | £4.99 | €5.49 | 59 kr |
| Premium yearly | $59.99 | £49.99 | €54.99 | 599 kr |
| Pro monthly | $14.99 | £11.99 | €13.99 | 149 kr |
| Pro yearly | $149.99 | £119.99 | €139.99 | 1,499 kr |

USD remains the fallback outside configured regions. Existing subscribers
remain on their current subscription currency. New Checkout sessions can use
the local alternatives.

PostHog receives `checkout_currency`, `presentment_currency` when supplied by
Stripe, and `adaptive_pricing_enabled` on Stripe webhook events. These
properties contain currency codes only, not addresses, IPs, card data, or
payment details.

To roll back, remove or disable the added currency options in Stripe's Product
catalogue for the four Note2Tabs recurring Prices. No application deployment
or database migration is required to revert the price configuration.
