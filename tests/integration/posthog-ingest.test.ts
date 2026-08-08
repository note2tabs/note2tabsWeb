import { beforeEach, describe, expect, it, vi } from "vitest";

const { capture, flushPostHogServerClientInBackground } = vi.hoisted(() => ({
  capture: vi.fn(),
  flushPostHogServerClientInBackground: vi.fn(),
}));

vi.mock("../../lib/posthogServer", () => ({
  isPostHogConfigured: vi.fn(() => true),
  createPostHogServerClient: vi.fn(() => ({
    capture,
  })),
  flushPostHogServerClientInBackground,
}));

import { ingestAnalyticsEvents } from "../../lib/analyticsV2/ingest";

describe("PostHog analytics ingestion", () => {
  beforeEach(() => {
    capture.mockClear();
    flushPostHogServerClientInBackground.mockClear();
  });

  it("normalizes and captures legacy events", async () => {
    const result = await ingestAnalyticsEvents({
      accountId: "user_123",
      cookies: { analytics_consent: "granted" },
      source: "test",
      body: {
        event_id: "event_123",
        event: "transcribe_start",
        path: "/transcriber",
        payload: { mode: "file" },
      },
    });

    expect(result).toMatchObject({
      ok: true,
      received: 1,
      written: 1,
      blocked: 0,
    });
    expect(capture).toHaveBeenCalledWith(
      expect.objectContaining({
        distinctId: "user_123",
        event: "transcription_started",
        properties: expect.objectContaining({
          mode: "file",
          $insert_id: "event_123",
          ingest_source: "test",
        }),
      })
    );
    expect(flushPostHogServerClientInBackground).toHaveBeenCalledOnce();
  });

  it("maps canonical page views to PostHog page views", async () => {
    await ingestAnalyticsEvents({
      cookies: {
        analytics_consent: "granted",
        analytics_anon: "anon_123",
      },
      body: {
        event_id: "page_123",
        name: "page_viewed",
        path: "/pricing",
      },
    });

    expect(capture).toHaveBeenCalledWith(
      expect.objectContaining({
        distinctId: "anon_123",
        event: "$pageview",
        properties: expect.objectContaining({
          $pathname: "/pricing",
          $process_person_profile: false,
        }),
      })
    );
  });

  it("preserves classified first-touch attribution supplied by the client", async () => {
    await ingestAnalyticsEvents({
      cookies: {
        analytics_consent: "granted",
        analytics_anon: "anon_attributed",
      },
      body: {
        event_id: "attributed_page_123",
        name: "page_viewed",
        path: "/editor",
        props: {
          first_touch_source: "instagram",
          first_touch_medium: "social",
          first_touch_referring_domain: "l.instagram.com",
          first_touch_landing_path: "/editor",
          first_touch_campaign: "bio",
          traffic_source: "instagram",
          traffic_medium: "social",
          utm_source: "instagram",
        },
      },
    });

    expect(capture).toHaveBeenCalledWith(
      expect.objectContaining({
        distinctId: "anon_attributed",
        event: "$pageview",
        properties: expect.objectContaining({
          first_touch_source: "instagram",
          first_touch_medium: "social",
          first_touch_referring_domain: "l.instagram.com",
          first_touch_landing_path: "/editor",
          first_touch_campaign: "bio",
          traffic_source: "instagram",
          utm_source: "instagram",
        }),
      })
    );
  });

  it("blocks events when consent is denied", async () => {
    const result = await ingestAnalyticsEvents({
      cookies: { analytics_consent: "denied" },
      body: {
        event_id: "blocked_123",
        name: "page_viewed",
      },
    });

    expect(result).toMatchObject({
      reason: "consent_denied",
      written: 0,
      blocked: 1,
    });
    expect(capture).not.toHaveBeenCalled();
  });

  it("captures events by default when the user has not opted out", async () => {
    const result = await ingestAnalyticsEvents({
      cookies: {},
      body: {
        event_id: "blocked_missing_123",
        name: "page_viewed",
      },
    });

    expect(result).toMatchObject({ written: 1, blocked: 0 });
    expect(capture).toHaveBeenCalledOnce();
  });

  it("sanitizes URLs, private routes, PII, and raw errors server-side", async () => {
    await ingestAnalyticsEvents({
      cookies: { analytics_consent: "granted", analytics_anon: "anon_123" },
      body: {
        event_id: "private_123",
        name: "page_viewed",
        path: "/reset-password/private-token?email=person@example.com#done",
        referrer: "https://google.com/search?q=private",
        props: {
          email: "person@example.com",
          name: "Private Person",
          error: "raw backend response",
          error_code: "backend_failed",
        },
      },
    });

    const properties = capture.mock.calls[0]?.[0]?.properties;
    expect(properties).toMatchObject({
      $pathname: "/reset-password/[token]",
      $referrer: "https://google.com",
      error_code: "backend_failed",
    });
    expect(properties.$current_url).not.toContain("private-token");
    expect(properties).not.toHaveProperty("email");
    expect(properties).not.toHaveProperty("name");
    expect(properties).not.toHaveProperty("error");
  });
});
