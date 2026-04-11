# Note2Tabs - convert songs into guitar tabs online

Official site: https://note2tabs.com

Note2Tabs is an online guitar tab generator and editor that turns audio into playable tablature.
Upload a song or paste a YouTube link, get guitar tabs fast, and refine them with built-in editing tools.

## Why Note2Tabs
- Convert audio to guitar tabs online
- Create tabs from YouTube or audio uploads
- Edit, simplify, and practice tabs directly in the browser
- Built for fast transcription workflows

## Use cases
- Learn songs quickly without searching for tab files
- Generate draft tabs for new music ideas
- Simplify difficult passages for practice

## Links
- Product: https://note2tabs.com

## Multi-guitar transcription option

The transcriber now exposes two separate audio-prep choices:

- `Does your audio include other instruments?`
  This controls the backend Demucs guitar-stem separation step.
- `Are there more than one guitar playing?`
  This controls the backend symbolic note-event separator.

The second option is for splitting one flat note-event list into two guitar groups after Basic Pitch has already produced note events.
It is not an audio stem separator.

For this to work in a deployed environment, the backend worker must be configured with the new track-separator model path and related env vars documented in the backend repo README.
