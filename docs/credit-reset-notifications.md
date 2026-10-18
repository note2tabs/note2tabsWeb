# Credit reset notifications

Audience: verified accounts with **0–3 credits immediately before a refresh**, existing reminder permission, and no unsubscribe or delivery-suppression marker. No permission is inferred from a purchase. Settings and unsubscribe pages describe these notices in all ten supported languages.

Free accounts: the UTC calendar-month refresh is checked during its first 72 hours. The backend balance must still reflect the previous month, and the user must have transcribed in that previous month. Users who have resumed, including an in-flight upload that already synchronized their backend balance, are excluded. This job never writes credit balances.

Paid accounts: the Stripe renewal transaction queues a notice only when it actually grants renewal credits and the previous balance was 0–3. Duplicate/out-of-order invoices do not queue another notice. This follows the existing billing grant behavior; it does not introduce new grants between annual renewals.

Sending: `/api/cron/credit-reset-reminder` accepts authenticated GET/POST requests using the existing scheduler authentication. It processes up to 50 eligible notices per invocation, skips notices older than 72 hours, rechecks permission after an atomic claim, and observes a seven-day email contact cooldown. All participants in the current engagement experiment are excluded to preserve its results. Email content uses the account's preferred language and the existing language validation/alert mechanism. SES complaints and permanent bounces suppress future notices.

Deduplication: free notices use account/month IDs; paid notices use invoice IDs. Atomic claims prevent overlapping scheduler runs from sending the same notice. Ambiguous SMTP failures are recorded and alerted, never automatically retried. A process killed after claiming can leave a `sending` notice: inspect provider logs before any manual recovery, since delivery may already have happened. `accepted` means provider acceptance, not inbox delivery; SES lifecycle events provide later delivery information.

## Rollout

1. Apply `20261018030000_credit_reset_notice` before enabling the flag. Deploy code with `CREDIT_RESET_EMAIL_ENABLED` absent or false.
2. Ensure existing email transport, unsubscribe signing, scheduler authentication, and SES lifecycle reporting are configured.
3. Set `CREDIT_RESET_EMAIL_ENABLED=true`. Configure an authenticated hourly scheduler for the endpoint. Do not put a secret in its URL.
4. An authenticated `?dryRun=1` checks existing pending notices without collecting, claiming, or sending. It does not preview unqueued monthly candidates.
5. Monitor `reminder_scheduler_run_completed` / failure events with scheduler `credit_reset`, delivery failures, `credit_reset_email_sent`, and SES delivery/bounce events. Alert on a missing hourly scheduler heartbeat using the same operational monitoring as other reminders. Do not reset ambiguous/sending states without provider evidence.

Disable the flag to stop collection and sending. Existing queued notices expire naturally. Schema and scheduler are separate rollout steps; adding this code alone does not activate customer emails.

## Verification

Focused Vitest tests cover ten language templates and mismatch rejection; authenticated/disabled/dry-run paths; overlapping sends; permission changes; failed sends; SES suppression; Stripe renewal deduplication and queueing. The optional `credit-reset-postgres.local.test.ts` exercises the actual migration and SQL against a disposable localhost PostgreSQL database named `credit_reset_test`, configured via `N2T_CREDIT_RESET_TEST_DB_URL`. It rolls back its temporary schema and never connects to production.
