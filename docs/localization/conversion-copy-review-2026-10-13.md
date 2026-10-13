# Chinese, Japanese and Korean conversion copy review

Reviewed October 13, 2026 against the supplied language audit, current source, and first-party terminology examples. Changes are local and have not been deployed. This is a reasoned copy revision, not evidence that a particular wording maximizes conversion or search volume.

## Research and decisions

- Japanese: [Guitar Pro's Japanese site](https://www.guitar-pro.jp/) uses 音源, 採譜, 耳コピ and TAB譜 in its music workflow. Keep TAB譜 and 採譜; use 音源ファイル for music uploads rather than the speech-oriented 音声 label. Explain fretboard position and scale-constrained input instead of leaving internal feature names in English. Existing Japanese search metadata already contains 音源, 自動採譜 and タブ譜, so it does not need an inflated keyword list.
- Korean: [Akbobada's TAB guidance](https://www.akbobada.com/cscenter/cs_faqContent.html?bgubun=7&bid=547) uses 타브 and 기타(Tab); its [music transcription role description](https://www.akbobada.com/cscenter/bbs_notice_view.html?bId=159) uses 채보. Pair the familiar output 기타 타브 악보 with clear 음원 upload and conversion wording. Retain 채보 in music context rather than treating it as a generic speech-transcription task. Repair the Heavy trial mistranslation and explain the editor's actual behavior.
- Chinese: [Songscription's audio-to-guitar-tab workflow](https://www.songscription.ai/cn/blog/audio-to-guitar-tabs) uses 音频, 六线谱, 吉他谱 and 扒谱. This is terminology evidence from another product's localized page, not independent proof of native fluency or keyword popularity. Keep the precise output 吉他六线谱 in headings/search metadata and use 音频转谱 in navigation and principal actions. Use 积分 consistently for subscription credits. 扒谱 is useful musician vocabulary, but does not need to replace every plain conversion instruction.
- [Google's title-link guidance](https://developers.google.com/search/docs/appearance/title-link) supports concise, accurate titles matching the page language and cautions against keyword stuffing. Refine the Korean title and audio-to-tab heading; preserve established Chinese and Japanese titles and existing canonical/hreflang routing.
- [NN/g's button guidance](https://www.nngroup.com/articles/ok-cancel-or-cancel-ok/) supports naming the action a button performs. Upload labels describe choosing a file; credit-cost labels specify credits rather than vaguely saying "lower cost." These are clarity improvements, not a measured conversion-lift guarantee.

## Product accuracy and implementation

- Translate monthly credit descriptions as whole messages, including the number placeholder. A shared MonthlyCredits component preserves the bold number while allowing natural word order. This fixes both homepage and dedicated pricing cards across supported languages.
- Preserve source meaning for future early-access eligibility. The supplied audit's suggested wording would make future access sound guaranteed; that is not the current offer.
- Describe snap-to-key as constraining note input to the selected scale, rather than scale sorting or repairing existing audio.
- Keep current prices, credit amounts, upload limits, trial eligibility and billing behavior. Chinese terminology changes do not alter credit calculations.
- Record the release through the existing locale_version property, now multilingual-site-9. This provides a comparison boundary once deployed; it does not imply that all language editions received editorial changes.
- Short model labels are separate UI elements. Concatenated extracted text is not sufficient evidence of a visual spacing bug, so no speculative spacing change was made.

## Validation and measurement

Existing catalog tests check complete language coverage and interpolation parity. The new component regression checks grammatical placement and bold-number rendering in Korean, Japanese and Chinese. Existing pricing and structured-data checks cover current offer behavior. Local HTTP rendering verifies homepage and pricing credit phrases, localized titles and canonical presence for all three languages; these checks do not certify mobile visual fit or native editorial quality.

After deployment, compare complete, equal windows by country AND language, using the existing locale_version boundary. Separate visitors, upload selection, accepted transcription, viewed result, checkout and unique completed subscriptions. Deduplicate jobs by job ID and subscriptions by checkout session ID. Include enough days for repeat use; small country samples and the recent Small model release are confounders.

For SEO, inspect Search Console by localized landing URL and country: indexing, impressions, clicks, CTR and query positions. Search-referred visits alone cannot establish that a translated URL ranked or that translation caused an increase. No claim of proven optimal keywords or conversion uplift is made by this revision.
