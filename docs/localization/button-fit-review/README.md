# Localized button fit

Fix for overflowing editor button labels after the editor localization release.

The earlier audit checked button width but missed wrapped text whose `scrollHeight` exceeded its fixed height. Spanish “Área de trabajo” and “Vista de tablatura” rendered as two lines inside 28px buttons. Brazilian Portuguese and Polish had the same issue. Expanded Practice controls also had crowded labels.

Changes:

- Compact mode names in Spanish, Brazilian Portuguese, Polish and Arabic. The switch keeps its existing dimensions and font size, with a maximum-width guard for narrow containers.
- Shorter Portuguese/Spanish speed-training names, Spanish count-in wording and Japanese solo labels.
- Fixed-height editor buttons keep labels on one line. Separate label/state spans have an explicit gap.
- The repeat count-in button shows its concise label; pressed state and styling remain, and its tooltip states on/off.
- Share and return buttons retain their original 8rem minimum width and 32px height, expanding naturally only if their text needs more room.
- Upload/YouTube controls, font sizes, editor actions and project data are unchanged.

Validation:

- All 939 tests in 171 files pass; TypeScript, production Webpack build and whitespace checks pass.
- 216 passing browser layout measurements across all eight languages. Widths include 320, 390, 768, 1280 and 1536px. Checks compare both `scrollHeight/clientHeight` and `scrollWidth/clientWidth`, plus document overflow.
- Coverage: Canvas/Tools; expanded count-in controls at all five widths; enabled speed training; playing-position context menus; homepage, editor landing and pricing buttons at three widths.
- Signed-in Share/return actions were not manually exercised. Their width sizing uses the same existing styles and content width; authentication and behavior are unchanged.

[Before/after measurements](checks.json) · [Spanish editor screenshot](spanish-editor.png)
