# Upgrade surface restoration — 24 October 2026

## Inventory and change

- **Long audio file, valid free clip:** restore the previous nonblocking `file_duration_limit_card` based on the full file duration exceeding60seconds. The October20 replacement checked selected clip length, which defaults to and is clamped to60seconds. This removed most exposure. Keep the priced dialog for an actual over-limit selection.
- **YouTube:** retain `youtube_clip_limit_inline`, which was never removed. A valid URL still triggers the offer without a metadata request or extra click. Free clips remain30seconds; Premium can select any section up to10minutes. Correct the stale first-ten-minutes copy in all ten languages.
- **Low but positive free credits (1–3):** restore `low_credits_card`. The replacement `credits_low` dialog intentionally stayed closed with positive credits, removing the old visible offer. Exhaustion and insufficient-credit submissions retain the new dialog.
- **Oversized file and locked Heavy model:** these are direct replacements, not missing exposure. Keep the new dialogs and analyze them separately.
- **Returning-user/editor engagement prompts:** not removed by the October20 popup replacement; do not duplicate or bypass their experiment/permission logic.

A single shared component handles restored offers on both entry pages. Only one inline offer is rendered: low credits takes precedence, followed by long file or valid YouTube link. All inline offers defer to a blocking limit, active upload or authentication handoff. Paid/staff plans do not receive Premium acquisition offers. Inactive file-mode selections no longer trigger file-limit dialogs when using YouTube. Restored links go directly to localized pricing; they do not wait for browser file storage.

## Separate measurement

Keep historical surface names for continuity. All inline-card lifecycle/click events now also include `offer_version=inline_upgrade_v1`. New dialogs retain their existing `popup_version=priced_limit_v2` and distinct surface names. Analyze exposure→click→checkout→subscription by person and funnel ID; never combine inline cards and blocking dialogs into one conversion rate. Deduplicate historical subscription events by checkout session and check against Stripe.

The earlier investigation found316 old duration-card viewers and28 clickers from October13 until the October20 rollout; no replacement duration-dialog viewed events through October23. A Japanese buyer and the October7 buyer were attributed to the duration offer. This supports restoring the opportunity, not claiming it caused all lost sales.

## Direct replacements: observed issue remains before the CTA

Read-only PostHog208789 query, production, known owner excluded; October20 17:10UTC through October23 inclusive:

| Dialog | Viewed users | Clicking users | Dismissing users |
|---|---:|---:|---:|
| File size (including Pro-required files) |15|0|13|
| Locked Heavy |5|1|4|
| Low credits/exhausted credits |7|1|5|

The dominant behavior is dismissal before clicking, so the storage failure fixed earlier does not explain the bulk of these observations. Plausible mechanisms to investigate are immediate interruption on file/model selection, presenting a price before users have experienced value, and dismissing the entire upgrade opportunity after returning to the transcriber. These are hypotheses, not proven reasons. The samples and unequal historical windows do not establish that the design alone caused a lower conversion rate. Keep file sizes, required tier, available credits, language/device/country, visibility, click and dismissal method in the analysis; raw dismissal events are not unique users. No redesign or rollback of direct replacements is included here.

## Validation

Component interaction tests cover long files with valid60second defaults, short/unknown duration, stale selections, all paid plans, blocking-dialog suppression, positive-low/zero credits, YouTube eligibility, single-offer priority, localized navigation and one-count visibility/click telemetry. Existing popup failure/cancellation, clip-limit, localization, currency parity and Stripe integration suites must pass. Vercel build is required before release.
