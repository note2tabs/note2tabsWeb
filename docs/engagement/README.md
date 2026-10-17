# Engagement rules implementation and historical replay

17 October 2026. Branch `codex/engagement-rules-20261017`, based on main `60032fa2`. No AI training. No deployment, merge, email sends, credit grants, or coupons.

## Implemented

* **Export telemetry:** one tracked attempt across file construction and browser handoff in the editor, workspace, and library. Distinct requested, prepared, download-initiated, and failed events; a stable transfer ID links stages. Covers TXT, JSON, MusicXML and MIDI. It does not claim the browser saved/opened the file on disk. No filenames, music contents or raw errors are collected.
* **File import telemetry:** request/parse/selection/cancellation/failure and persisted completion in the file picker, plus workspace JSON import. Track selection retains the same attempt ID. Completion is recorded once data persists, before optional optimization or post-import navigation; those later failures cannot relabel a successful import as failed. Existing transcription-to-editor events remain separate from external file imports.
* **Pure rule engine:** 30-day point-in-time snapshots classify transcription, external import, export, practice, and editing value; distinct jobs/projects/sessions/days; recent voluntary pricing and billing intent; actual plan-limit reasons; failed/recovered attempts; checkout, impressions, dismissals, inactivity, and previous emails. Future events and duplicate IDs are excluded. No browser dwell-time inference is used.
* **Prioritized decisions:** no action, recovery help, relevant-limit Premium CTA, repeat-value Premium CTA, and reminder intents for practice, exported work, imported work, editing, or another transcription. Paid/unknown entitlement, unsafe UI moments, unresolved failures, missing email permission, unverified addresses, unsubscribe, cooldowns, recent activity, and inaccessible saved work constrain decisions.
* **Durable shadow infrastructure:** allowlisted signed-in signals enter indexed account-linked tables through the existing consent-gated ingestion path. Stable event IDs dedupe retries. Account deletion cascades, signed-in analytics opt-out purges these records, and the shadow job prunes signal/decision history after 31/90 days. Truncated snapshots cannot authorize promotion.
* **Evaluation endpoints:** authenticated POST `/api/engagement/decision`; scheduler-authenticated GET/POST `/api/cron/engagement-decisions`. Both are shadow-only. The existing Premium surface can request comparisons at its current display checkpoint behind an independent public flag. Existing display/send policies are not replaced.
* **Replay harness:** the same snapshot builder and evaluator run against historical event sequences. Aggregate output and exact extraction SQL are committed; raw pseudonymous person histories remain outside the repository.

“Real value” here means observed useful behavior, not proven satisfaction. Imports/saves/practice-mode entry have different evidential strength; no arbitrary final score is represented as a purchase probability. Current foreground editor duration is explicitly excluded because it does not establish attention.

## Historical results

Source: Note2TabsAnalytics, PostHog project 208789. September 1 through October 15, UTC, with observations ending exclusively October 16. Six ordered pages yielded **2,841 distinct people and 39,566 events**. Eligible extraction records contain a signup or tracked subscription event; this is not all site traffic.

For return analysis, use people whose first observed signup is September 1–October 7 and who were not tracked as subscribed before that signup: **2,280 people**. A return is a meaningful product/login event **at least 24 hours and less than seven days after signup**, not just a later calendar date. All these users have a mature seven-day observation window. This definition differs from earlier calendar-day retention reports and should not be compared directly.

| Test | Historical coverage | What the number means |
|---|---:|---|
| Value observed during the first six hours | 76 / 92 eventual seven-day returners (82.6%) | This also flags 1,819 / 2,280 people. Only 76 / 1,819 (4.18%) return, versus 4.04% overall: weak selectivity. |
| Behavioral reminder eligibility before the first return | 37 / 92 returners (40.2%) | 1,681 flagged, 37 observed returners (2.20%). A two-day inactivity rule deliberately cannot target many fast natural returners. Permission/verification/access gates are not historically recoverable; this is not a sendable audience count. |
| Prior value before first tracked subscription event | 6 / 12 people | Value evidence, not a successful purchase predictor or a billing-reconciled count of new subscriptions. |
| Full Premium rule, including existing contact and checkout gates | 0 / 12 tracked subscribing people | It flags 25 non-subscribing people during the window. Current evidence does not support this rule as a reliable subscriber predictor. |

Why not loosen the last rule to produce a better number? Several buyers already had an existing prompt/dismissal or were in checkout; another prompt would have been inappropriate. Six had no qualifying prior value in the extracted history. Removing those gates or borrowing post-purchase activity would inflate apparent coverage without demonstrating a useful decision.

The replay also compares prespecified individual signals in earlier (Sep 1–21) and later (Sep 22–Oct 7) cohorts. In the later cohort:

* Overall return: **41 / 964 (4.25%)**.
* Early voluntary pricing visitors: **3 / 34 (8.82%)** returned, covering only 3 of those 41 returners.
* Early practice users: **25 / 395 (6.33%)** returned, covering 25 of 41.
* Early deliberate-edit users: **33 / 695 (4.75%)** returned, covering 33 of 41.

These are descriptive associations with small positive counts, not statistically established lift or causal intervention effects. Wilson 95% intervals, false-positive/negative counts, flag rates, and full period results are in `backtest-2026-10-17.json`. The later block is a chronological sensitivity check, not an untouched independently validated deployment test: this research already inspected aggregate outcomes before implementation. Thresholds were not optimized against individual buyers.

Historical exports and the new external-file import completion events are missing, so those branches cannot be validated retrospectively. They are never fabricated from server file-generation requests or generic import events. Only known structural IDs and event properties were extracted; legacy `jobId` and canonical `job_id`, plus `blocked_reason`, are normalized consistently.

Existing marketing and product changes influenced outcomes. Anonymous/opted-out/missing telemetry and internal accounts can affect counts; the existing internal cohort was empty. First observed signup/purchase in a bounded window is not guaranteed first-ever. Subscription labels are deduplicated by person, not reconciled against paid invoices; nonbuyers at cutoff may purchase later. The purchase opportunity replay has differing observation lengths and is exploratory, unlike the mature fixed-window return cohort. These limitations prevent claims of validated prediction accuracy, causal lift, or profit improvement.

## Reproduce

1. Execute `history-query.sql` in project 208789, paginating with `OFFSET 0, 500, ...` until a short page. Do not assume the connector returns all rows of a larger LIMIT. It currently caps at 500 rows. Input format is an array of `{person, events}` with each event tuple ordered as SQL specifies.
2. Keep raw data outside git. The local extract for this run is `/tmp/n2t-engagement-history-final.json`; its SHA-256 is recorded in the report.
3. Run `node scripts/engagement/backtest.mjs /path/to/history.json docs/engagement/backtest-2026-10-17.json` with Node 22.18+ native TypeScript stripping. No Python/ML libraries or credentials are needed for replay.

## Configuration and rollout

Both switches default off:

```
ENGAGEMENT_SIGNALS_ENABLED=false
NEXT_PUBLIC_ENGAGEMENT_SHADOW_ENABLED=false
```

Apply the migration using the project's normal deployment process before enabling signal persistence. The migration has been schema-validated, not run against production. Public flag changes require a frontend rebuild. No cron schedule was added automatically: call the authenticated shadow job explicitly; it processes 100 accounts per page and returns a cursor for continuation. This avoids adding unreviewed workload.

The email evaluator records a behavioral recommendation separately from the actual permission-gated decision. `marketingPermission` is deliberately false in the cron until a verified permission source is integrated. A behavioral recommendation does not authorize sending. An accessible canvas check proves account ownership/existence, not that every piece of content is useful; the recorded value evidence supplies additional context.

The current system does **not** send personalized marketing emails, render additional CTAs, or issue incentives. Existing campaigns are unchanged. This is intentional because the historical test failed to establish adequate targeting performance. No new email copy or translations are presented to users. Connect actual dispatch only after integrating verified marketing permission, actual delivery/contact history from all legacy campaigns, localized templates and deep links, atomic contact reservations/outbox, and a clean user-level randomized test. Do not assume new local signal history includes older server-only reminder sends or cross-device opt-outs.

No credits/coupons path exists. Never interpret a client-generated value signal as authorization for a financial reward; any future incentive needs server-verified eligibility, unique issuance/redemption, budgets, and incremental contribution tests.

## Validation

Targeted tests cover temporal leakage, duplicate jobs/events, genuine limits versus invalid input, context-sensitive value, pricing recency/source, paid and unknown entitlement, unresolved recovery, checkout/cooldowns, permission/verification/unsubscribe, recent activity, export formats, persisted import terminal states, analytics failure isolation, incomplete snapshots, and the replay harness. Existing proxy, ingestion, Premium and consent checks are included. TypeScript and Prisma schema validation are separate checks. Browser UX and production database migration have not been exercised in this branch.

The immediate decision is to collect complete import/export evidence and compare shadow recommendations. The current results do not justify relying on these rules for automatic incentives or replacing existing conversion handling.
