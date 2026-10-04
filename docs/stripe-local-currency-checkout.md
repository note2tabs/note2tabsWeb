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

Configured local prices as of 2026-10-04:

| Market | Currency | Premium monthly | Premium yearly | Pro monthly | Pro yearly |
| --- | --- | ---: | ---: | ---: | ---: |
| United States/default | USD | $5.99 | $59.99 | $14.99 | $149.99 |
| India | INR | ₹299 | ₹2,999 | ₹749 | ₹7,499 |
| Brazil | BRL | R$21.90 | R$219 | R$54.90 | R$549 |
| Indonesia | IDR | Rp64,900 | Rp649,000 | Rp162,900 | Rp1,629,000 |
| China | CNY | ¥30 | ¥300 | ¥75 | ¥750 |
| Mexico | MXN | MX$89 | MX$899 | MX$219 | MX$2,199 |
| Philippines | PHP | ₱199 | ₱1,999 | ₱499 | ₱4,999 |
| Malaysia | MYR | RM19.90 | RM199 | RM49.90 | RM499 |
| Thailand | THB | ฿139 | ฿1,399 | ฿349 | ฿3,499 |
| South Africa | ZAR | R69.99 | R699.99 | R174.99 | R1,749.99 |
| Poland | PLN | 19.99 zł | 199.99 zł | 49.99 zł | 499.99 zł |
| South Korea | KRW | ₩7,900 | ₩79,000 | ₩19,900 | ₩199,000 |

GBP, EUR, SEK, CAD, AUD, NZD, CHF, NOK, DKK, JPY, and SGD retain their
previously approved fixed local prices on the same replacement Price objects.

Localized prices use the ECB reference cross-rates from 2026-10-02 as their
baseline, then apply customer-friendly endings. SEK and DKK deliberately use
ending-in-9 commercial prices. JPY includes an additional exchange-rate buffer
for its higher recent volatility. The emerging-market prices are deliberately
purchasing-power-aware rather than direct FX conversions. These are fixed
prices; review them periodically against payment fees, exchange rates, taxes,
refunds, affiliate commission, and model usage costs.

Stripe Checkout uses dynamic payment methods: the application deliberately
does not pass `payment_method_types`. Managed Payments is not enabled. Stripe
filters the enabled methods by the Checkout currency, buyer location, device,
browser, and subscription compatibility instead of showing every enabled
method in every session.

Validated live subscription Checkout pools as of 2026-10-04:

| Market/currency | Eligible pool before buyer/device ranking |
| --- | --- |
| United States / USD | Card, Link, Amazon Pay |
| Euro area / EUR | Card, SEPA Direct Debit, Klarna, Link, Revolut Pay, Amazon Pay, Satispay for eligible Italian buyers, and iDEAL/Wero for eligible Dutch buyers |
| United Kingdom / GBP | Card, Klarna, Link, Amazon Pay |
| Sweden / SEK | Card, Klarna, Link, Amazon Pay |
| Brazil / BRL | Card, Link, Pix Automático |
| India / INR | Card, Link, UPI (Stripe dashboard and API both report it active and available) |
| Indonesia / IDR | Card, Link |
| China / CNY | Card, Link; Alipay and WeChat Pay requested but not approved by Stripe |
| Mexico / MXN | Card, Link; OXXO excluded because it cannot renew subscriptions automatically |
| Philippines / PHP | Card, Link |
| Malaysia / MYR | Card, Link |
| Thailand / THB | Card, Link |
| South Africa / ZAR | Card, Link, Amazon Pay |
| Poland / PLN | Card, Klarna, Link, Revolut Pay; BLIK cannot be used in Checkout subscription mode |
| South Korea / KRW | Card, Link, Kakao Pay, Naver Pay, Korean cards |

Apple Pay and Google Pay are enabled wallet presentations of eligible card
payments and appear only on supported devices and browsers. iDEAL/Wero is
enabled for Dutch EUR customers and renews through SEPA Direct Debit. Satispay
is enabled for eligible Italian EUR customers. TWINT is pending Stripe approval
for Swiss CHF customers. Cartes Bancaires is pending for French EUR customers.
Bacs Direct Debit is configured as preferred but remains inactive until its
separate Dashboard activation flow is completed. PayPal and Alipay currently
report that this account is ineligible.

Stripe's dynamic payment methods perform the final country, currency, device,
and subscription-compatibility filtering. Enabling a regional method therefore
does not add it to every buyer's Checkout page. Methods that cannot fund an
automatically charged Checkout subscription remain disabled. This includes
MobilePay, Swish, Bancontact, EPS, Przelewy24, Pay by Bank, Bizum, MB WAY,
Multibanco, OXXO, BLIK, PAYCO, and Samsung Pay. Alipay and WeChat Pay are
configured as preferred but remain unavailable until Stripe approves the
account for them. Korean cards, Kakao Pay, and Naver Pay are active for KRW;
Stripe excludes them automatically outside eligible South Korean Checkout.

Live Dashboard status was reconciled with the Payment Method Configuration API
on 2026-10-04. The methods that are both active and relevant to the current
subscription currencies are card, Apple Pay, Google Pay, Link, Amazon Pay,
Revolut Pay, Klarna, SEPA Direct Debit, iDEAL/Wero, Satispay, Pix, UPI,
Korean cards, Kakao Pay, and Naver Pay.

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
