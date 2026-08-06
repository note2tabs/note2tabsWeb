import { beforeEach, describe, expect, it, vi } from "vitest";
import { createResponse } from "node-mocks-http";

const { capture, flushPostHogServerClient } = vi.hoisted(() => ({
  capture: vi.fn(),
  flushPostHogServerClient: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../lib/posthogServer", () => ({
  isPostHogConfigured: vi.fn(() => true),
  createPostHogServerClient: vi.fn(() => ({
    capture,
  })),
  flushPostHogServerClient,
}));

import { ingestAnalyticsEvents } from "../../lib/analyticsV2/ingest";

describe("PostHog analytics ingestion", () => {
  beforeEach(() => {
    capture.mockClear();
    flushPostHogServerClient.mockClear();
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
          source: "test",
        }),
      })
    );
    expect(flushPostHogServerClient).toHaveBeenCalledOnce();
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
    const res = createResponse();
    const result = await ingestAnalyticsEvents({
      res: res as any,
      cookies: {},
      body: {
        event_id: "blocked_missing_123",
        name: "page_viewed",
      },
    });

    expect(result).toMatchObject({ written: 1, blocked: 0 });
    expect(capture).toHaveBeenCalledOnce();
    const setCookies = res.getHeader("Set-Cookie") as string[];
    expect(setCookies.join("\n")).toContain("analytics_session=");
    expect(setCookies.join("\n")).toContain("Max-Age=1800");
    expect(setCookies.join("\n")).toContain("analytics_anon=");
    expect(capture.mock.calls[0]?.[0]?.distinctId).toEqual(expect.any(String));
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
