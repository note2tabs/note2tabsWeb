# Signup conversion investigation — 21 October 2026

Compared complete UTC weeks 27 September–3 October and 11–17 October in PostHog project 208789. Used native ordered, unique-person funnels with a 24-hour conversion window, first-ever recorded pageview, production hosts, detected bots excluded, and two confirmed owner/test profiles excluded. These are investigation definitions, not an approved data-catalog metric. A first-recorded visitor is not necessarily a genuinely new person: cookie clearing, a new device and identity gaps remain limitations.

## Findings

| Measure | Earlier week | Later week |
| --- | ---: | ---: |
| First-recorded visitors | 932 | 1,495 |
| Visitor → signup, approximately | 46% | 34% |
| Reached login/signup page after entry | 600 / 932 (64.4%) | 687 / 1,495 (46.0%) |
| Signup after reaching that auth page | 378 / 600 (63.0%) | 491 / 687 (71.5%) |
| Preserved a transcription for authentication | 496 / 932 (53.2%) | 607 / 1,495 (40.6%) |
| Signup after that preserved-upload handoff | 328 / 496 (66.1%) | 451 / 607 (74.3%) |
| Organic-search visitor → signup | 350 / 726 (48.2%) | 375 / 1,145 (32.8%) |
| Direct visitor → signup | 27 / 80 (33.8%) | 95 / 251 (37.8%) |
| Homepage entrant → signup | 273 / 552 (49.5%) | 276 / 745 (37.0%) |
| Narrow viewport (<768 px) → signup | 177 / 387 (45.7%) | 204 / 572 (35.7%) |
| Wider viewport (>767 px) → signup | 250 / 545 (45.9%) | 299 / 923 (32.4%) |

The principal decline is before authentication or before visitors prepare an audio selection. People who reach account entry or save an upload convert better, and absolute signup counts on those paths increased. The search acquisition segment weakened while direct conversion improved. Both viewport groups weakened, so mobile mix alone does not explain it. US conversion also declined (40.9% → 32.1%); weaker Japanese/Chinese conversion is not a complete explanation.

Confidence: high about the location of the decline; low-to-medium about its cause. Broader or lower-intent search traffic is a hypothesis, not a demonstrated causal explanation. No particular release has been established as the cause. The Oct 1 sign-in wording change and Oct 8–9 localization launches are candidate context, not proof. No generic SaaS conversion benchmark establishes that a 34% tracked visitor-to-account rate is intrinsically bad.

Signup attempts completed at approximately 93.2% and 91.5% in the respective weeks. `signup_started` means email submission or Google initiation from the signup page, not form arrival; Google signup initiated from login bypasses that event. Historical browser-produced signup events also differ from authoritative account-creation events introduced Oct 17, so raw event counts across that transition should not be compared as equivalent account counts. The funnels above use unique people.

Three available auth-related recording metadata results had zero console errors, but their recording IDs did not join to analytics event session IDs in the focused lookup. No replay-based causal conclusion was drawn. Missing login-failure instrumentation likewise prevented treating the prior zero-error count as evidence that credentials never failed.

## Changes on this branch

- Keep signup/login switches above credentials, preserving the sanitized and localized return destination. Returning users still enter the existing login route; we do not guess whether an anonymous visitor already has an account.
- Move the existing Google option above email credentials. Email remains directly available in every language, including Chinese.
- Remove the optional name field from signup; the existing API already accepts omitted names. Account settings can still collect a name.
- Show the existing 10-character password requirement before submission and provide an optional show-password control. Passwords remain masked by default and security policy is unchanged.
- Show the existing short “Start free · No credit card required” message before an audio selection on homepage and transcriber, replacing it with the existing saved-selection explanation when ready to submit.
- Handle rejected, missing or thrown automatic login after successful account creation: send the user to login with a translated account-created message and the original return destination, instead of silently returning them signed out to the transcriber. This is a reproduced code defect, not proven to be the historical conversion cause.
- Guard rapid signup submissions. Record first email-form interaction once per mounted page and browser validation failure once per unchanged form, using categories only. Record previously missing credential-login rejection and network failures. Existing `signup_started` and server-owned `signup_completed` semantics are unchanged. No credentials or input values are added to telemetry.
- Translate all three new strings across all ten languages.

## Research and applicability

1. [Google Research: Simple is better](https://research.google/blog/simple-is-better-making-your-web-forms-easy-to-use-pays-off/) and the linked [CHI 2014 study](https://research.google/pubs/designing-usable-web-forms-empirical-evaluation-of-web-form-improvement-guidelines/): controlled study with 65 participants, three original/improved forms; clearer advance requirements and error support improved completion time, first-attempt success and satisfaction. Supports showing password constraints; does not establish an expected signup uplift for this product.
2. [Nielsen Norman Group: Registration and login on mobile](https://www.nngroup.com/articles/checklist-registration-login/): recommends essential fields, social login, explicit requirements and optional password visibility. Directly applicable to our email/password flow. We retain verification, which also serves abuse prevention, rather than copying every recommendation.
3. [Nielsen Norman Group: Login walls](https://www.nngroup.com/articles/login-walls/): account creation adds cost before visitors know the product's value. Supports making free entry and both account paths clear. It does not justify removing our transcription authentication gate without considering compute cost and abuse.

No claimed conversion lift, copied ecommerce benchmark, new promotional popup, anonymous GPU transcription or marketing-email change.

## Validation

- 47 focused tests pass: actual mounted signup/login behavior, automatic-login failure recovery, duplicate-submission protection, Google retry, native validation telemetry, all ten rendered locales, original return paths, server-owned signup analytics and mocked account lifecycle integration.
- TypeScript and webpack production build pass.
- Actual production build served locally: English account-mode switch preserves pending-upload return path. English/French/Arabic mobile signup fits a 390×844 viewport (submit bottom ~733 px), no horizontal overflow; Arabic document direction is RTL. Browser preference restored to English after testing.
- No production accounts created, emails sent, payments attempted, or production configuration changed.
- Wider localization suite: two pre-existing failures in `frenchItalianLocales.test.ts`. French and Italian already contain 24 additional public keys relative to English on the branch base (0785bb98), causing exact-key-set assertions to fail. This branch adds the same three keys everywhere and does not introduce or remove that existing difference. Ten-language signup-specific checks pass.

## After release

Compare mature, same-weekday 24-hour visitor cohorts by source, entry page, language and viewport. Follow auth-page reach, first form interaction, validation rejection, submission and real account creation separately. Preserve login-based Google signup in the overall conversion measure. Also check first successful transcription and subscriber conversion: a signup increase with worse activation would not be a useful improvement. Do not infer impact from an uncontrolled before/after percentage alone.
