# Live currency parity — 15 October 2026

All four subscription prices have 23 explicit currency amounts. The adjacent JSON manifest records the Stripe IDs and website amounts. BRL and IDR use their original 4 October amounts across both plans and intervals; every other amount is unchanged.

New checkout selects currency from Vercel's country header, using the same country mapping as website pricing. Client-submitted currency is analytics only. Checkout verifies the configured Stripe price's currency amount and interval against the website before creating a session, and fails closed on mismatch. JPY and KRW use zero-decimal minor units. Historical price IDs remain recognized for subscription entitlements. Existing subscriptions are not migrated.

Production environment variables to set:

| Variable | Stripe price |
| --- | --- |
| STRIPE_PRICE_PREMIUM_MONTHLY | price_1UQo7W4WRmrnOGtcqrTotLPw |
| STRIPE_PRICE_PREMIUM_YEARLY | price_1UQo7X4WRmrnOGtcGoVGWSuw |
| STRIPE_PRICE_PRO_MONTHLY | price_1UQo7Y4WRmrnOGtcli3j59C0 |
| STRIPE_PRICE_PRO_YEARLY | price_1UQo7Z4WRmrnOGtcYeCeHWLl |

The isolated deployment includes the existing JP/CN/PL/ES replay configuration. It excludes the pending French/Italian, Latin America, tax and landing-page drafts. No merge is part of this rollout. Pro launch controls and tax-registration settings are unchanged.

Validation: all 92 live Stripe amounts retrieved and compared with the website catalogue; automated tests cover currency selection and mismatched configurations. Hosted Checkout validation creates unpaid sessions and immediately expires them; it does not test payment completion.

Rollback: the preceding production deployment is dpl_5yFTeGNkc2qi45Dk4gdPbCdicFCx (note2tabs-qkauko7jm-note2tabs-5087s-projects.vercel.app). Promoting that immutable deployment restores its code and environment snapshot. Do not archive historical prices while existing subscriptions use them.
