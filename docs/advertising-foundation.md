# Advertising foundation

The existing Note2Tabs placements are intentionally provider-neutral. Advertising is disabled by default and no
provider script is loaded until all of the following are configured:

1. `NEXT_PUBLIC_ADS_ENABLED=true`
2. `NEXT_PUBLIC_AD_PROVIDER=bridge`
3. A unit ID exists for the placement.
4. `window.note2tabsAdBridge` has been installed by an approved provider integration.
5. Advertising consent is available, unless an approved limited-ads configuration has explicitly been enabled.

The bridge is the boundary for Google Ad Manager, Prebid/header bidding, or another managed monetization partner. It
receives the placement, sizes, configured demand sources, consent mode and a provider-event callback. Product pages do
not load provider scripts or know auction details.

The existing `/dev/ad-placements` page uses an in-memory mock bridge to exercise slot mounting and lifecycle callbacks.
It makes no network requests, emits no production analytics or revenue, and requires no provider credentials.

## Safety defaults

- Global and per-placement kill switches are environment-controlled.
- Region blocking is supported through the `note2tabs_region` cookie. The edge/deployment layer must set a trustworthy
  country or regulatory-region value before this is used for enforcement.
- Premium, admin and moderator roles are excluded by the placement owners.
- Refresh is disabled by default. If enabled after provider approval and inventory declaration, it is clamped to at
  least 60 seconds, stops after the configured maximum, and runs only while the page is visible, at least 50% of the
  slot is visible and recent user activity exists.
- Provider scripts are never loaded merely because an empty placement exists. Loading begins when an eligible slot
  becomes meaningfully visible.
- Dismissed ads are removed for ten minutes. The small ad-free Premium suggestion does not create an ad request.

## Measurement contract

The runtime emits separate events so UI exposure is never mistaken for a paid impression:

- `ad_slot_presented`: the tasteful UI placement was offered.
- `ad_slot_eligible`: consent, region, visibility and activity checks passed.
- `ad_request`, `ad_fill`, `ad_no_fill`, `ad_error`.
- `ad_impression`: provider-confirmed impression only.
- `ad_viewable_impression`: provider-confirmed viewability only.
- `ad_client_viewable_observation`: the separately labelled one-second client observation used for product diagnostics.
- `ad_refresh_requested`: an engagement-aware refresh was requested.
- `ad_revenue`: provider revenue in integer micros, currency and demand source.

Every event includes placement, provider, slot session ID and refresh count. PostHog can use these with existing editor,
transcription and Premium-funnel events to calculate fill, eCPM, revenue per editor hour, completion impact, conversion
impact and combined revenue per user. Provider reporting remains the billing source of truth.

## Provider connection gates

Before production activation:

- Select and configure a Google-certified CMP with IAB TCF support for EEA/UK/Switzerland traffic. The existing
  first-party preference UI is not represented as a certified TCF CMP.
- Configure GPP or other required regional signals with the chosen CMP/provider.
- Declare every refreshing unit and its actual minimum refresh interval in the provider console.
- Implement the bridge adapter and map provider lifecycle/revenue callbacks to the typed event contract.
- Configure CSP, ads.txt/sellers.json entries, unit IDs and demand sources.
- Test consent granted/denied/withdrawn, Premium exclusion, background tabs, off-screen units, inactivity, no-fill,
  provider failure, route changes, dismissal and mobile layouts.
- Start with refresh disabled, then canary an approved 60-second viewable-and-engaged policy behind the existing
  PostHog experiment while monitoring editor retention, transcription completion and Premium conversion.
