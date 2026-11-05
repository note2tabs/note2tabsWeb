# Imported instrument sound and selector corrections

The reported Acoustic Guitar/synth mismatch is reproducible: legacy imports retain a built-in `gm:piano`, `gm:bass`, or synth preset while the desktop selector falls back to its first sampled sound, Acoustic Guitar. Playback and the visible menu therefore disagree. Legacy saved piano tracks also use an oscillator despite an existing recorded piano bank.

The shared resolver now maps legacy piano, bass, synth-lead and synth-pad IDs to the corresponding available recorded bank. The desktop and shared sound selector use the resolved ID, including genuine built-in sounds for which no sampled equivalent exists. Selecting Acoustic Guitar resolves to the acoustic sample bank, never the oscillator branch.

On new imports, valid General MIDI guitar programs determine acoustic/jazz/clean/overdrive/distortion assignments rather than accepting a stale acoustic default. Electric-piano programs 4 and 5 use Upright Piano, the existing recorded-piano approximation; there is no dedicated electric-piano bank. Names provide fallbacks when no valid program exists. Drum tracks use the drum kit rather than inheriting a guitar preset. Original valid program metadata is preserved through import/save/reload independently of editor notation type.

## Explicit temporary bass policy

The user clarified that clean electric bass was being assigned Bass (Overdrive), then explicitly requested keeping the current sample library and routing **both acoustic bass and clean electric bass to the distorted/overdriven bank until a clean bank is added**. This change follows that instruction. It does not relabel the existing overdrive recordings as clean bass. Synthesized legacy bass IDs resolve to that same approved sampled fallback, and the menu displays Bass (Overdrive).

Existing generalized GM aliases are resolved at runtime; no bulk database rewrite or customer-data migration is needed. Old tracks explicitly saved as Acoustic Guitar remain acoustic, since that may be a deliberate user choice; missing historical program metadata is not guessed from renamed track titles. Existing manual sound choices are retained through persistence.

## Validation

- Reproduced nine failing mapping cases before implementation, including legacy piano playback, electric-piano imports and stale guitar-program assignments.
- 134 tests across 15 suites cover imports, named/GM assignments, accurate selector labels, save/reload metadata, actual buffer-source scheduling rather than oscillators, audio recovery and both-format asset coverage.
- TypeScript and webpack production build checked.
- Native browser OfflineAudioContext rendered every one of the 12 recorded banks through the real playback scheduler in Opus and forced-MP3 modes: 24 non-silent renders with no oscillator calls.
- Additional native browser renders checked acoustic, legacy piano, legacy bass and acoustic/fingered/picked bass program assignments against the approved sample banks.

No backend deployment, new audio assets, external service, new database queries, migration, or automatic customer-record editing is involved. Unsampled orchestral/generic GM sounds still retain their existing built-in synthesis; the selector now shows them honestly instead of Acoustic Guitar.
