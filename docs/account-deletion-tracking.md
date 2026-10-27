# Completed account deletions

The prior `account_deletion_confirmed` event was browser-side after a successful DELETE request and before sign-out. It was not a reliable durable count. Keep historical events separate from the new series; do not add the two together or claim past missing events mean no deletions.

`account_deleted` is now recorded by the deletion API. Its outbox receipt and account/database deletion commit in one Prisma/PostgreSQL transaction. Failed deletions or concurrent retries cannot add another receipt. The existing outbox delivers the same immutable event UUID/timestamp on retries. The browser no longer emits the old completion event; start/goal/alternative funnel events remain.

This is an anonymous operational count: no deleted user ID, email, country, locale, plan, or free-text reason is stored in the receipt. All events use `system:account-deletions`, disable person-profile processing and geo-IP. Count **events**, not unique people. Production is filtered by `environment=production`.

PostHog daily bar chart: https://eu.posthog.com/project/208789/insights/Hu5FUGE4

It starts with release of the new code, not earlier deletions. Created/query-checked before deployment; zero at that point only establishes that the new event has not been delivered yet.

Validation: unit tests for anonymous payloads and failure paths; real disposable PostgreSQL tests for successful deletion, concurrent/repeated calls and receipt-insert failure rolling back account/content/pending-capture deletion; existing durable-delivery PostgreSQL tests verify retry identity and acknowledgement-failure recovery. No real production account was deleted for testing.
