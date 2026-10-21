# Bass landing page localization

Two distinct pages are translated into the existing ten site languages: `/bass-tab-editor` for manual notation and `/audio-to-bass-tabs` for audio conversion. Each edition has its own route, title, description, headings, CTA labels, explanatory paragraphs, six FAQs, image alt text and related links. No existing Brazilian guitar copy was rewritten.

## Terminology choices

| Edition | Instrument / notation | Audio workflow |
| --- | --- | --- |
| Brazilian Portuguese | baixo / tablatura | transcrever áudio de baixo |
| Spanish | bajo / tablatura | transcribir audio de bajo |
| French | basse / tablature | transcription, enregistrement de basse |
| Italian | basso / tablatura | trascrizione |
| Japanese | ベース / TAB譜 | 音源をTAB譜に変換; 耳コピ支援 in the title |
| Korean | 베이스 / 타브 악보 | 채보, 변환 |
| Polish | bas / tabulatura basowa | nagranie na tabulaturę, transkrypcja |
| Simplified Chinese | 贝斯 / 指法谱 | 音频转谱, 扒谱工具 |
| Arabic | غيتار الباس / تابات | تحويل صوت الباس إلى تابات |

Chinese bass copy uses four-string notation, avoiding the guitar-specific 六线谱 in the shared generation label. The related link to the six-string *guitar* editor retains its accurate label. Japanese and Korean avoid speech-transcription terminology. Arabic uses the site's existing instrument noun consistently; visual reading order is RTL while string/fret notation stays LTR. Standard tuning letters and export-format names stay consistent with the actual editor.

These choices are editorial localization, not measured keyword-volume findings or a claim of native-speaker certification. Representative primary references consulted for musical terminology:
- Japanese official Guitar Pro features: https://www.guitar-pro.jp/features/
- Japanese official Guitar Pro site: https://www.guitar-pro.jp/
- French music-transcription product documentation: https://klang.io/fr/help/get-started/
- Simplified Chinese music-transcription documentation: https://klang.io/zh-hans/help/如何开始使用-klangio-应用/
- Brazilian Portuguese notation workflow: https://klang.io/pt-br/help/transcription-viewer/

## Search and navigation

All 20 canonical bass URLs appear once in the sitemap, with reciprocal English, nine translated editions and x-default alternates. Existing release switches and preview noindex rules apply. Language choice and localized cross-links use the existing locale helpers. New routes participate in the same language-detection middleware as the existing transcription pages. No redundant bass synonym pages were created.

## Validation

Automated checks render both pages in all ten locales and verify complete catalog coverage, translated metadata and FAQ schema, localized product destinations and cross-links, route existence, canonical/hreflang values and sitemap uniqueness. Desktop Japanese and RTL Arabic browser checks supplement the rendered tests. A webpack production build checks all new routes and TypeScript.

The earlier real authenticated editor save/reload test is a separate outstanding check: Google OAuth does not authorize the unique preview callback URL. Localized page verification does not establish that authenticated round trip.

Broader regression checks also found 24 pre-existing source-catalog omissions: every translated public catalog contained the same popup keys absent from English. Their identity entries were restored in the English reference catalog; no existing translated popup wording changed. The additional-language and French/Italian completeness suites then passed.
