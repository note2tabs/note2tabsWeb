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

| Plan | USD | GBP | EUR | SEK | CAD | AUD | NZD | CHF | NOK | DKK | JPY | SGD | BRL | INR | IDR |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Premium monthly | $5.99 | £4.99 | €5.49 | 59 kr | CA$8.99 | A$8.99 | NZ$10.99 | CHF 4.99 | 59 kr | 39 kr | ¥999 | S$8.49 | R$14.99 | ₹299 | Rp48,999 |
| Premium yearly | $59.99 | £49.99 | €54.99 | 599 kr | CA$85.99 | A$89.99 | NZ$109.99 | CHF 49.99 | 599 kr | 399 kr | ¥9,999 | S$84.99 | R$149.99 | ₹2,999 | Rp489,999 |
| Pro monthly | $14.99 | £11.99 | €13.99 | 149 kr | CA$21.99 | A$21.99 | NZ$26.99 | CHF 12.49 | 149 kr | 99 kr | ¥2,499 | S$20.99 | R$37.99 | ₹749 | Rp119,999 |
| Pro yearly | $149.99 | £119.99 | €139.99 | 1,499 kr | CA$214.99 | A$219.99 | NZ$269.99 | CHF 124.99 | 1,499 kr | 999 kr | ¥24,999 | S$209.99 | R$379.99 | ₹7,499 | Rp1,199,999 |

Localized prices use the ECB reference cross-rates from 2026-10-02 as their
baseline, then apply customer-friendly endings. SEK and DKK deliberately use
ending-in-9 commercial prices. JPY includes an additional exchange-rate buffer
for its higher recent volatility. BRL, INR, and IDR are purchasing-power-aware
local prices selected for the Brazilian, Indian, and Indonesian markets. These
are fixed prices rather than live conversions; review them periodically against
payment fees, foreign-exchange costs, taxes, refunds, and model usage costs.

Stripe Checkout uses dynamic payment methods: the application deliberately
does not pass `payment_method_types`. Managed Payments is not enabled. Stripe
filters the enabled methods by the Checkout currency, buyer location, device,
browser, and subscription compatibility instead of showing every enabled
method in every session.

Validated live subscription Checkout pools as of 2026-10-04:

| Market/currency | Eligible pool before buyer/device ranking |
| --- | --- |
| United States / USD | Card, Link, Amazon Pay |
| Euro area / EUR | Card, SEPA Direct Debit, Klarna, Link, Revolut Pay, Amazon Pay |
| United Kingdom / GBP | Card, Klarna, Link, Amazon Pay |
| Sweden / SEK | Card, Klarna, Link, Amazon Pay |
| Brazil / BRL | Card, Link, Pix Automático |
| India / INR | Card, Link, UPI AutoPay |
| Indonesia / IDR | Card, Link |

Apple Pay and Google Pay are enabled wallet presentations of eligible card
payments and appear only on supported devices and browsers. PayPal, US ACH,
and Cartes Bancaires remain requested but unavailable on the Stripe account.
Methods that cannot support Note2Tabs' automatically charged subscription flow,
or that target a market without an approved local Price, are disabled to keep
Checkout focused. This includes iDEAL/Wero, Bancontact, EPS, TWINT, Alipay,
WeChat Pay, and the Korean wallets until their corresponding rollout is ready.

Potential next markets require explicit price approval before adding another
currency option to the immutable Stripe Prices:

| Priority | Market | Currency | Relevant Stripe method | Status |
| --- | --- | --- | --- | --- |
| 1 | China | CNY | Alipay; WeChat Pay | Recurring access requires Stripe approval; keep disabled until approved and tested |
| 1 | Mexico | MXN | Cards and wallets | OXXO cannot fund an automatically renewed subscription |
| 1 | Philippines | PHP | Cards and wallets | No Philippine-specific recurring method for the Swedish account |
| 2 | Malaysia | MYR | Cards and wallets | FPX/GrabPay aren't available to the Swedish account for this subscription flow |
| 2 | Thailand | THB | Cards and wallets | PromptPay doesn't support automatic subscription Checkout here |
| 2 | South Africa | ZAR | Cards and wallets | No local bank method available through this account |
| 2 | Poland | PLN | BLIK | BLIK is eligible and can be activated with an approved PLN Price |
| 2 | South Korea | KRW | Korean cards and wallets | Eligible methods exist; activate only with an approved KRW Price |

Suggested monthly price alternatives for review (not configured):

| Market | Premium conservative | Premium growth | Pro conservative | Pro growth |
| --- | ---: | ---: | ---: | ---: |
| China | CN¥39 | CN¥29 | CN¥99 | CN¥79 |
| Mexico | MX$99 | MX$79 | MX$249 | MX$199 |
| Philippines | ₱299 | ₱199 | ₱749 | ₱499 |
| Malaysia | RM25 | RM19 | RM59 | RM49 |
| Thailand | ฿199 | ฿149 | ฿499 | ฿399 |
| South Africa | R99 | R79 | R249 | R199 |
| Poland | 24.99 zł | 19.99 zł | 59.99 zł | 49.99 zł |
| South Korea | ₩9,900 | ₩7,900 | ₩24,900 | ₩19,900 |

Before approving a growth price, compare net receipts after payment-method
fees, FX, tax, refunds, affiliate commission, and transcription/model costs.

USD remains the fallback outside configured regions. Existing subscribers
remain on their current subscription currency. New Checkout sessions can use
the local alternatives.

PostHog receives `checkout_currency`, `presentment_currency` when supplied by
Stripe, and `adaptive_pricing_enabled` on Stripe webhook events. These
properties contain currency codes only, not addresses, IPs, card data, or
payment details.

To roll back, restore the preceding four recurring Price IDs in Vercel. Existing
subscriptions stay attached to their original Prices and must not be migrated
or cancelled. Revert the localized-pricing application commit separately to
restore the preceding set of displayed currencies.
