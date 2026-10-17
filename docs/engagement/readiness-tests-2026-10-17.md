# Experiment readiness checks — 17 October 2026

Updated the experiment branch against main, including released email localization, account language, the language popup and the reminder retry fix. No production migrations, experiment activation or customer email sends were performed by these checks.

## Validation

- Full suite: 1,518 tests pass across 209 files. The 27 local PostgreSQL cases are intentionally skipped in this ordinary run.
- Explicit PostgreSQL run: all 27 cases pass against a disposable `engagement_test` database on loopback. The actual two engagement SQL migrations are applied by the test suite. Tests execute real parameterized SQL and transaction locks, with only authentication, PostHog and email transport intercepted.
- TypeScript and a complete production build pass.
- Client lifecycle tests mount the actual experiment provider in a browser DOM: three groups, the 1,200 ms timing, visible acknowledgement, dismissal, pointer/keyboard cancellation, backgrounding, navigation, restart, late responses and network failure.
- Chrome checks use development-only synthetic accounts and intercepted experiment responses: control allows no optional prompt; existing uses the legacy checkpoint; contextual renders the actual Premium card after the pause. Arabic card checked at 390 × 844 and viewport restored. These fixtures do not prove server authorization; the separate database/API tests cover it.
- All five contextual reminder types in all ten languages pass the production email language validator, including signed unsubscribe links and Arabic RTL.

## Problems corrected

- Added an explicit, localized reminder preference in account privacy settings and authenticated GET/PUT API. Missing permission remains false. Only a verified account can opt in; body-supplied account IDs are ignored. Saved basis and timestamp provide provenance. Opt-out updates both permission and legacy suppression. Signed email unsubscribe revokes the permission record. Explicit re-subscription never clears delivery/complaint suppression.
- Navigation now cancels a pending contextual timer before it reserves a contact. A changed path or background page is rechecked after telemetry flush and before claiming.
- Existing-policy CTAs now share the incomplete-history, checkout and unresolved-failure safety gates. Unknown account roles fail closed.
- The email cap recognizes existing signup reminder and saved-tab cooldown markers, including those predating experiment launch.
- Scheduler candidate queries exclude previously assigned control accounts, recent contacts and recently evaluated no-action accounts before LIMIT, preventing these rows from starving later candidates. Contact-cap skips are audited for the same reason.
- Experimental scheduler and SMTP failures feed the existing reminder failure/heartbeat alert pipeline. Uncertain SMTP results retain the reservation and cannot automatically retry a potentially delivered message.
- Updated contextual reminder rendering to use the already-released account language and canonical `/transcribe` links, rather than event-derived language or the nonexistent `/transcriber` route.

## Database checks

Checks include default denial; permission provenance; unauthenticated, cross-origin, malformed and unverified opt-ins; signed unsubscribe; bounce suppression; 12 concurrent cross-campaign claims producing one reservation; independent email/CTA channels; accepted/failed/cancelled/uncertain outcomes; the rolling seven-day boundary; legacy contact history; control suppression; French sends in existing/contextual arms; dry-run without enrollment/contact/email; repeated uncertain dispatch; paid/recently active exclusions; both arms' checkout/failure gates; contextual threshold/checkpoint authorization; 110 existing control accounts not starving a later candidate; and alert telemetry on delivery failure.

Run local database tests only after provisioning a disposable database with the project schema:

```sh
N2T_ENGAGEMENT_TEST_DB_URL=postgresql://postgres:local-test-only@127.0.0.1:55437/engagement_test npx vitest run tests/integration/engagement-readiness.local.test.ts
```

The test refuses non-loopback hosts or any database name other than `engagement_test`, and truncates only that explicit disposable test database. Email transport is a spy; it does not send to customers or the user's inbox.

## Merge versus launch

The code is designed to merge with flags disabled. Before activating treatment, apply the two engagement migrations through the release workflow, enable signal collection, verify incoming account-linked outcomes and the permission workflow in the deployed environment, and allow a useful observation window. Then coordinate server/client/reminder flags with the native PostHog gate. Do not claim the experiment is running or sending reminders from a merge alone. Existing customers are not opted in automatically. No coupon or free-credit treatments are added.

Existing real French transactional-email inbox delivery was confirmed separately; these tests do not claim that a new contextual campaign email was delivered through the provider. A controlled operational smoke test remains a launch check, not a reason to contact customers during code verification.

## Classic reminder compatibility follow-up

Five additional PostgreSQL regression cases verify that both contacted arms preserve the classic once-per-tab marker and fourteen-day account cooldown after the experimental seven-day minimum cap has elapsed. Claims use the same deterministic legacy tokens, so an in-flight classic scheduler and the experimental path cannot both win that marker. Definite non-sends release classic markers while retaining the experimental reservation; uncertain SMTP outcomes retain both. Permission/verification/entitlement/activity are checked again after marker creation, excluding only the newly claimed cooldown, and revocation at that boundary cancels delivery. This also preserves protection when the experiment is subsequently switched off.
