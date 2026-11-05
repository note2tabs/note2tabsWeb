# Additional playback banks

Integrated on `feature/new-instrument-samples`. These are playback sounds; selecting
one does not convert the track between tablature, notation or drums.

| Menu group | Sound / folder | Source |
| --- | --- | --- |
| Bass | Acoustic Bass / `bass_acoustic` | Local GeneralUser GS, bank 0 / program 32 |
| Bass | Upright Bass / `bass_upright` | Karoryfer Meatbass, pizzicato |
| Piano | Harpsichord / `harpsichord` | Versilian Community Sample Library (English harpsichord) |
| Organ & reeds | Organ / `organ` | FreePats Drawbar Organ Emulation, 2019-07-12 |
| Organ & reeds | Accordion / `accordion` | FreePats Button Accordion HN, 2024-03-29 |
| Strings | Solo Violin / `SViolinVib` | VSCO 2 Community Edition 1.1.0 |
| Brass | Trumpet / `TrumpetSus` | VSCO 2 Community Edition 1.1.0 |
| Brass | Trombone / `TromboneSus` | VSCO 2 Community Edition 1.1.0 |
| Brass | French Horn / `FHornSus` | VSCO 2 Community Edition 1.1.0 |
| Woodwinds | Flute / `FluteSusNV` | VSCO 2 Community Edition 1.1.0 |
| Woodwinds | Tenor Saxophone / `saxophone` | FreePats Tenor Saxophone, 2020-07-17 |
| Woodwinds | Harmonica / `harmonica` | Versilian Community Sample Library (Hohner Special 20) |
| Percussion | Xylophone / `xylophone` | FreePats Medium Mallets, 2020-07-06 |
| Other | Ukulele / `ukulele` | FreePats Ukulele, 2026-08-11 |
| Other | Harp / `harp` | FreePats Concert Harp, 2020-07-02 |
| Other | Banjo / `banjo` | itsclipping SX six-string guitar banjo (`ganjo`) |

Upstream projects: [FreePats](https://freepats.zenvoid.org/),
[VSCO 2 CE](https://github.com/sgossner/VSCO-2-CE/tree/1.1.0),
[VCSL SFZ](https://github.com/sgossner/VCSL/tree/sfz).
Retain the upstream source attribution and CC0 notices when regenerating assets.

## Playback and asset corrections

- Every playable root has both Opus and MP3. Sample URLs use content hashes so a
  changed recording invalidates browser/CDN caches without disabling caching.
- The accordion, harmonica and harpsichord conversions initially included release
  regions in place of attack regions. Rebuilt 54 roots from the original sustained
  attack recordings. A harpsichord root that exists only in the release group is
  omitted from the manifest; its pitch still plays using the nearest attack root.
- Restored attack-region tuning and accordion loop points. Playback applies cents
  tuning and source loops, with a 2 ms tolerance for codec duration rounding.
- All sampled banks now use perceptual loudness calibration, with bounded
  per-root corrections and peak headroom. Attacks, sustain and decay are retained;
  user volume settings are not rewritten. See `docs/instrument-loudness-calibration.md`.
- Preparation downloads/decodes only the nearest roots needed for the track.
  Shared downloads and decoded buffers are reused across previews and playback.
  Opening or searching the sound dropdown does not load audio files.

## Import mapping

General MIDI program numbers are zero-based. New mappings cover harpsichord (6),
xylophone (13), organ (16–20), accordion/bandoneon (21/23), harmonica (22), violin
(40), harp (46), trumpet (56), trombone (57), French horn (60), saxophones (64–67),
piccolo/flute (72/73), and banjo (105). Ukulele and other recognizable instrument
names work when a valid program is absent. Null/empty program metadata stays
absent instead of accidentally becoming piano program 0.

The tenor sax bank approximates the other saxophone programs; the flute bank
approximates piccolo. Ensembles, cello, clarinet and other instruments without a
matching recording retain their existing fallback rather than being labelled as
an unrelated recorded instrument. Existing piano/bass defaults remain unchanged.
This affects new transcription imports, not customers' saved sound selections.

Acoustic-bass program 32 now uses `bass_acoustic`; contrabass program 43 uses
`bass_upright`. Named upright/double bass and contrabass imports use notation;
acoustic bass uses bass tablature. Explicit representation choices are preserved.
Clean electric bass and existing `gm:bass` selections retain the previous bank.

The acoustic bank is rendered from the **complete GeneralUser preset** with
FluidSynth at velocity 100, preserving its layered zones, tuning, filters and
envelopes. Reverb and chorus are disabled. This is labelled as GeneralUser's
Acoustic Bass preset, not claimed to be a specifically recorded acoustic bass
guitar. Upright Bass uses the distinct Meatbass plucked double-bass recordings,
the velocity-100 layer and first round robin; percussion key switches are excluded.
Source: [Meatbass](https://shop.karoryfer.com/pages/free-meatbass),
[GeneralUser GS](https://schristiancollins.com/generaluser.php).

## Local verification

`python scripts/audit-playback-samples.py --output <report.json>` decodes both
formats for all new banks and checks non-silence and loop bounds. `--all` includes
the existing banks. The new library has 251 playable roots / 502 audio files,
including 18 acoustic-bass roots and 13 upright-bass roots.

`python scripts/repair-sustain-samples.py --sources <extracted-source-root>`
rebuilds the three affected banks from their source SFZ attack groups. The source
folder layout is recorded in that script. Neither script runs during deployment.

`scripts/build-bass-playback-samples.py --soundfont <GeneralUser-GS.sf2>
--fluidsynth <fluidsynth executable> --meatbass <source folder>` reproduces both
bass banks. The Meatbass folder must contain `pizz_basic_map.sfz` and the pitched
`*_vl4_rr1.wav` files from its `Samples/pizz` directory. These source recordings
and the soundfont/build tools are not bundled with the website.
