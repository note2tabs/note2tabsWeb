# Advertising foundation

Note2Tabs treats ads as secondary monetization for the free product. The runtime is disabled by default and does not load a provider until the account, placement, region, consent, visibility, and activity checks all pass.

## Current architecture

- `AdvertisementSlot` retains the existing editor, practice, and transcription-loading presentation. Premium, administrator, and moderator accounts never render inventory.
- `useAdSlotRuntime` owns provider lifecycle, viewability, activity, refresh eligibility, teardown, and analytics.
- `AdProvider` is the stable provider contract. A future Google Ad Manager/Prebid integration should implement `window.note2tabsAdBridge`; product components must not call provider SDKs directly.
- The built-in `mock` provider makes the complete lifecycle reviewable without credentials at `/dev/ad-placements`. It must not be used as live demand.
- The edge supplies a coarse ISO country cookie only on routes that can contain inventory. This supports the regional kill switch without exposing an IP address to the client.

## Safety defaults

- Global default: off (`NEXT_PUBLIC_ADS_ENABLED=false`).
- Missing provider or unit ID: fail closed and render no placeholder to users.
- Advertising consent: required by default. Limited ads without consent require an explicit policy/provider review and flag.
- Refresh: off by default, minimum 60 seconds, capped per slot, and only after a continuously visible, foreground, recently active interval.
- Completed transcriptions are never gated behind an ad.
- Empty/error demand collapses instead of leaving a blank ad frame.
- Ads can be disabled globally, by placement, or by country without code changes.

## Provider bridge

The bridge receives a slot ID, placement, unit ID, supported sizes, configured demand sources, and limited-ads state. It returns `refresh` and `destroy` handles and emits normalized events: `fill`, `no-fill`, `impression`, `viewable`, `revenue`, and `error`.

GAM, header bidding, or another partner belongs behind this bridge. The adapter is responsible for its certified consent signal, provider policy, auction timeout, creative safety, and mapping provider callbacks to the normalized events. Provider-reported impressions and revenue are the source of truth; merely displaying the Note2Tabs slot is not counted as a paid impression.

## Measurement

PostHog receives these events when analytics consent exists:

- `ad_slot_presented`, `ad_slot_eligible`, `ad_request`
- `ad_fill`, `ad_no_fill`, `ad_impression`, `ad_viewable_impression`
- `ad_refresh_requested`, `ad_revenue`, `ad_error`, `ad_dismissed`
- `ad_experiment_exposure` and the existing Premium prompt/click events

Every runtime event includes placement, provider, slot session, refresh count, account type, and editor/job context when available. These join with editor-session, transcription-completion, pricing, checkout, subscription, retention, and acquisition events through the existing PostHog person/session identity.

Recommended dashboard formulas:

- fill rate = filled requests / ad requests
- viewability = provider-viewable impressions / impressions
- eCPM = revenue micros / impressions / 1,000
- editor revenue per hour = editor ad revenue / active editor duration
- total revenue per user = subscription revenue + ad revenue
- guardrails by experiment variant: D1/D7 retention, editor active minutes, transcription completion, pricing visits, checkout starts, and subscriptions

Do not optimize an ad variant on impression revenue alone. A rollout should stop if product retention, successful transcription, editor engagement, or Premium conversion materially declines.

## Activation checklist

1. Complete legal/CMP and partner policy review for every target region.
2. Implement and test one bridge adapter in a preview environment.
3. Verify Premium suppression, consent withdrawal, region blocking, no-fill, errors, teardown, and background/inactive behavior.
4. Validate provider-reported impression and revenue reconciliation.
5. Start with refresh disabled and a small free-user feature-flag cohort.
6. Establish product and Premium guardrails before testing refresh.
7. Enable one placement at a time, with the global and placement kill switches ready.

Configuration is documented in `.env.example`. Placement-specific refresh overrides use `TRANSCRIPTION_LOADING`, `EDITOR`, or `EDITOR_PRACTICE` suffixes.
