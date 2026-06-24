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

## PostHog analytics

Web analytics are sent to PostHog. Prisma/Neon remains responsible for product
data such as users, authentication, credits, saved tabs, canvases, and jobs.

1. Create a PostHog Cloud project in the EU region.
2. Copy the project token and host from PostHog project settings.
3. Configure these variables locally and in Vercel:

```env
NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN="phc_..."
NEXT_PUBLIC_POSTHOG_HOST="https://eu.i.posthog.com"
POSTHOG_PROJECT_TOKEN="phc_..."
POSTHOG_HOST="https://eu.i.posthog.com"
POSTHOG_DASHBOARD_URL="https://eu.posthog.com/project/..."
NEXT_PUBLIC_POSTHOG_SESSION_RECORDING="false"
```

The project token is intended for event ingestion and is safe to expose through
the `NEXT_PUBLIC_` variable. Do not put a PostHog personal API key in the browser.

The browser SDK captures page views, autocaptured interactions, custom product
events, and web vitals. Server-side GTE and feedback events use `posthog-node`.
Analytics consent continues to use the `analytics_consent` cookie; denying
consent opts out and resets the PostHog browser identity.

After deployment, create PostHog insights and a dashboard for:

- `$pageview`
- `cta_clicked`
- `signup_started`, `signup_completed`, and `signup_failed`
- `transcription_started`, `transcription_queued`, `transcription_succeeded`, and `transcription_failed`
- `gte_editor_created`, `gte_editor_saved`, `gte_editor_exported`, and `gte_editor_action`
- `user_feedback_submitted`
- `web_vital`

The legacy analytics tables are no longer read or written. Drop them only after
you have verified PostHog ingestion and exported any historical analytics you
want to retain.
