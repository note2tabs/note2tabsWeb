# Editor design localization audit — 19 October 2026

The properties-inspector redesign introduced translation calls without catalog entries. Added 100 editor messages across all ten supported languages: English, Brazilian Portuguese, Spanish, Japanese, Korean, Polish, Arabic, Simplified Chinese, French and Italian.

Coverage includes note/chord properties, alternative fingerings, fret-position optimization/generation, key detection, transposition, subdivision, lengthening, overlap cleanup, selection instructions, accessibility labels and validation errors. Existing translations are retained. Musical pitch names, chord symbols, fractions and keyboard shortcuts retain their functional notation.

Tool names embedded inside translated selection labels are now translated before interpolation. The direct editing-tool label/hint also use the translation system. New properties-panel units and scale-menu text use logical alignment for RTL. Chord diagrams show the conventional fret number with a localized Fret tooltip instead of the English `fr` suffix.

Regression coverage reads translation calls (including conditional arguments) from the redesigned workspace and controls, validates dynamic selection-tool labels and hints, and checks the actual runtime translator. The existing suite checks full catalog parity, placeholders, server-selected language, tutorial/instrument messages and locale routing.

Verification: TypeScript and the production build passed; 148 tests passed across five localization/editor suites. Browser checks covered French note properties and the optimization dialog, plus Arabic optimization on desktop and at 390px mobile width. Test content was a local guest note; no customer project or account preference was edited.
