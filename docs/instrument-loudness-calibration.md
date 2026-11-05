# Instrument loudness calibration

Offline calibration for all 28 sampled instrument banks. No real-time loudness
processing, library-wide audio re-encoding, database writes or extra downloads.

## Method

- Decode the actual Opus recordings with ffmpeg, retaining stereo channels.
- Render repeated 0.25, 0.75 and 2 second notes with the playback attack/release
  envelope and source loop points. Measure EBU R128 integrated loudness.
- Match to the original acoustic-guitar bank at unity gain: **-21.07 LUFS**
  for the reference profile (70% ordinary notes, 30% held notes).
- Apply one bank gain plus bounded per-root corrections (at most +/-6 dB, with
  additional attenuation if needed for an estimated single-note peak below 0.8
  in either decoded Opus or MP3).
- Preserve natural transients, sustain, decay, timbre and the user's track volume.
  There is no compressor or limiter. Polyphonic summation still needs mixer headroom.
- The existing drum-kit balance is unchanged: cymbals should not be made as loud
  as kick/snare simply to give every hit the same measurement.

Across the 28 banks, the median 0.75-second profile now spans **-21.60 to -20.48
LUFS** (about 1.1 dB). The 2-second profile spans -23.13 to -20.18 LUFS. Very short
notes retain their natural differences: slow synth attacks are quieter than
plucked bass attacks. Pitch-register corrections are limited to avoid boosting
background noise or erasing the character of each instrument.

## Before and after

Values below are median loudness for the combined ordinary/held-note profile.

| Bank | Before (LUFS) | After (LUFS) |
| --- | ---: | ---: |
| `acoustic` | -21.1 | -21.1 |
| `jazz` | -13.6 | -21.1 |
| `electric` | -22.1 | -21.1 |
| `electric_overdrive` | -13.0 | -21.1 |
| `electric_distortion` | -8.9 | -21.1 |
| `bass_overdrive` | -15.8 | -21.1 |
| `upright_piano` | -15.7 | -21.1 |
| `grand_piano` | -17.6 | -21.1 |
| `synth_lead_bowed` | -16.7 | -21.1 |
| `synth_lead_new_age` | -13.4 | -21.1 |
| `synth_lead_sweepPad` | -13.7 | -21.1 |
| `synth_lead` | -13.1 | -21.1 |
| `organ` | -16.8 | -21.1 |
| `accordion` | -18.1 | -21.1 |
| `saxophone` | -15.3 | -21.1 |
| `xylophone` | -16.9 | -21.1 |
| `ukulele` | -17.2 | -21.1 |
| `harp` | -15.4 | -21.1 |
| `banjo` | -22.1 | -21.1 |
| `SViolinVib` | -16.3 | -21.1 |
| `TrumpetSus` | -18.2 | -21.1 |
| `TromboneSus` | -19.4 | -21.1 |
| `FHornSus` | -18.6 | -21.1 |
| `FluteSusNV` | -17.1 | -21.1 |
| `harmonica` | -12.8 | -21.1 |
| `harpsichord` | -20.0 | -21.1 |
| `bass_acoustic` | -20.8 | -21.1 |
| `bass_upright` | -19.1 | -21.1 |

## Reproduce

`python scripts/normalize-instrument-loudness.py --report <report.json>` is read-only.
Add `--write` to update manifest calibration. Requires local NumPy, ffmpeg and
ffprobe. Measurements are cached by audio content and loop points in the OS
temporary directory. The original unity-gain reference makes repeated runs
idempotent. Run again after regenerating any source audio.

`python scripts/audit-playback-samples.py --all` verifies decoding and effective
gain/peak measurements in both Opus and MP3. Neither script runs on deployment.

Browser listening review remains necessary for subjective balance; the calibration
and file decoding checks do not constitute an in-browser audition.

The check also found a corrupt MP3 packet in `banjo/59.mp3`. That fallback was
rebuilt from its matching Opus recording and its content hash updated. The audit
now treats decoder errors as failures even if ffmpeg produces partial audio.
