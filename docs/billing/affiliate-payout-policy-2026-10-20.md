# Affiliate payouts: minimum balance and monthly batches

## Policy

- Minimum released earnings: US$25 equivalent. Smaller balances carry forward without expiry.
- Only commissions past the existing individual refund/dispute hold are eligible.
- At most one new batch per affiliate per UTC calendar month. Retries resume the same immutable batch; they do not include newly earned commissions.
- The cron still checks daily, allowing onboarding or temporary errors to recover. It cannot make a second batch after a successful release that month, including when retrying an older month's batch.
- Stripe Express bank payout schedule: monthly, on the 28th. Transfers after that month's cutoff can arrive the following month; bank processing can take additional time. No instant payouts are created.
- Deactivated affiliates retain previously earned commissions under the same rules.

## Fees and currency

Published Swedish Connect platform-managed pricing checked 20 October 2026: 15 SEK per active account in payout months, plus 5 SEK + 0.25% per bank payout. Fees vary by connected-account country and negotiated agreement. Source: https://stripe.com/se/connect/pricing

The three existing affiliates are Swedish Express accounts, not yet onboarded, with no commissions as of the read-only audit. Their schedules were daily. No account settings or live funds have been changed by this branch.

The platform currently settles payments in SEK. A source charge can be denominated in EUR, USD, BRL, etc.; do not submit that original currency/amount as a SEK payout. Allocate each gross commission from the original charge's actual Stripe balance-transaction amount, rounding down in settlement minor units. Payment processing fees are not deducted from the affiliate's agreed gross commission. Refunds reverse only that commission's persisted allocation from the grouped transfer.

Use the ECB daily reference rates solely to decide whether the settlement-currency balance meets US$25, not to perform a currency exchange. Reject stale (>7 days), future, missing or unsupported rates; leave funds pending. Different settlement currencies within one batch fail closed for review rather than being added numerically. All current production funds settle in SEK. Sources:
- https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml
- https://docs.stripe.com/connect/separate-charges-and-transfers
- https://docs.stripe.com/connect/manage-payout-schedule

The batch uses ONE transfer from the platform's available balance, without `source_transaction` (one transfer cannot name multiple source charges). The platform must retain enough available settlement-currency funds to pay commissions; payouts already sent to Note2Tabs' own bank account are not automatically recalled. If insufficient funds, no commission is marked paid, the frozen batch remains pending, and the cron returns an error for retry after funding. This implementation does not change the platform's own bank payouts, add money, or move live funds.

## Retry and refund integrity

- Database unique constraint `(affiliateId, month)` plus a transaction-scoped advisory lock shared with refund handling prevents overlapping runs.
- Commit the frozen batch and allocations before calling Stripe. Stable transfer group and idempotency key identify the batch. Reconcile Stripe's transfer group before retrying, including after Stripe's idempotency window expires.
- Stripe success followed by an uncommitted DB acknowledgement is recovered from Stripe, not paid twice.
- If a commission is refunded before an unsent batch transfers, cancel that batch and carry its other commissions forward. Do not silently pay a changed/below-minimum batch.
- Refunds share the payout lock and reconcile ambiguous transfers first. Reversal metadata is checked before retrying a reversal, so a DB acknowledgement failure cannot reverse it twice.
- Existing per-commission transfer IDs and original-currency reversal amounts remain supported.
- `PAID` remains the existing commission-ledger meaning: transferred to the connected Stripe account. It is not confirmation of bank arrival.

## Rollout

1. Review and merge this branch only when approved.
2. Apply migration `20261020010000_monthly_affiliate_payouts` before production code runs.
3. Deploy with the normal pinned Stripe API version. No payment or account API migration is needed.
4. Set existing Express accounts to the same monthly schedule (28th) and verify. New invitations include it; the payout worker also verifies/sets it before sending any funds.
5. Verify the authenticated cron returns zero processed affiliates when there are no pending commissions. Do NOT manufacture commissions or initiate a live payment for testing.
6. Check the platform's available SEK funding before the first earned batch becomes eligible. Below-minimum earnings do not create an active payout month.

## Validation

Focused tests cover threshold boundaries, settlement currency/minor units, refund holds, onboarding, month limits, legacy payouts, stale/missing rates, transfer/reversal retries and error paths. An optional real PostgreSQL test suite applies the actual migration to a disposable local database and tests competing reservations/senders, ambiguous Stripe responses, refund allocation, month rollover, and concurrent refunds. Stripe is simulated there; no live transfers occur.

Local test setup: disposable Postgres database named `n2t_affiliate_payout_test`, host localhost/127.0.0.1 only. Set `AFFILIATE_PAYOUT_TEST_DATABASE_URL` and run `npx vitest run tests/integration/affiliate-payout-concurrency.test.ts`. The test suite deletes test rows and refuses non-local database URLs.

Validation completed: 154 tests passed, including six actual-Postgres concurrency/recovery tests; TypeScript and the production build passed. The migration was applied successfully to an isolated Postgres 16 database, which was stopped after testing. The ECB endpoint returned current USD and SEK rates. No production migration, Stripe account update or transfer was executed.
