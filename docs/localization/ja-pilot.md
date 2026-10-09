# Japanese localization

Implemented on `codex/ja-localization` from main, 9 October 2026.

Japanese mirrors Portuguese and Spanish coverage: 42 route modules, 1,753 catalogue strings, and 26 published blog articles. Public product, pricing, editor landing, feature guides, legal/contact/about, blog archives and RSS, auth/reset/verification, transcription progress, workspace/settings/history/sharing, and email preference routes reuse the existing data and authorization rules. Verification, password reset, and transcription completion emails support Japanese. User names, project names, filenames, tokens, and editor control names remain intact. The interactive `/gte` editor stays English, and its navigation retains Japanese.

Terminology: TAB譜 (tablature), 採譜 (transcription), 運指 (fingering), 指板 (fretboard), 音高 (pitch), チョーキング (bend), ハンマリング (hammer-on), プリング (pull-off), ストローク (strum). Explanations use polite Japanese; action labels are short. Blog editions retain the source meaning in concise Japanese and preserve links and scientific citations. Article title and revision guards prevent serving stale translations. Reading time uses a 500-character/minute estimate, with Japanese word segmentation for the metadata; this is a UI estimate, not a measured reading speed.

Language uses device/browser Accept-Language unless a saved choice or direct language URL takes precedence. Currency still follows trusted country information. Existing Japan prices remain Premium ¥999/month or ¥9,999/year, Pro ¥2,499/month or ¥24,999/year. Brazilian prices and checkout price selection are unchanged.

Tracking separates `content_locale`, `visitor_country`, `visitor_market`, `localization_cohort`, and `locale_version=multilingual-site-4`. Japan is `visitor_market=japan`; Japanese in Japan is `ja:JP`, English in Japan `en:JP`, Japanese in Brazil `ja:BR`. Delayed transcription events and positive paid invoices retain originating context. Yen revenue remains zero-decimal and must not be combined directly with other currencies. Preview traffic is excluded from production comparisons.

Validation: 888 tests across 169 files passed, production compilation passed, all 26 articles compiled with valid translated links/TOCs, and 178 Japanese page/width checks plus 48 four-language regression checks found no horizontal overflow or clipped controls. Widths: 390, 768, 1440px. Upload/YouTube switch remains 48px high. Language chooser closes after selection. Guest editor navigation preserves `/ja/transcribe`. Authenticated actions and payment/email dispatch were tested with mocks; no live purchase, account deletion, or email sending occurred.

Screenshots: `ja-transcriber-mobile.jpg`, `ja-pricing-mobile.jpg`, `ja-editor-desktop.jpg`. Layout measurements are in `ja-layout-checks.json`.

Japanese is implemented and technically tested, but has not received independent native-speaker or Japanese legal review. No Japanese-language customer support promise was added.
