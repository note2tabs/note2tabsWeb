import { beforeEach, describe, expect, it, vi } from "vitest";

const { capture, flush } = vi.hoisted(() => ({
  capture: vi.fn(),
  flush: vi.fn(async () => undefined),
}));

vi.mock("../../lib/posthogServer", () => ({
  isPostHogConfigured: vi.fn(() => true),
  createPostHogIngestClient: vi.fn(() => ({
    capture,
    flush,
  })),
}));

import { ingestAnalyticsEvents } from "../../lib/analyticsV2/ingest";

describe("PostHog analytics ingestion", () => {
  it("separates Spanish countries and English traffic using trusted edge geography", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    for (const [path,country,cohort,market] of [["/es/editor","ES","es:ES","spain"],["/es/editor","MX","es:MX","spanish_latin_america"],["/editor","MX","en:MX","spanish_latin_america"],["/pt-br/editor","BR","pt-BR:BR","brazil"]]) {
      await ingestAnalyticsEvents({req:{headers:{"x-vercel-ip-country":country}} as any, body:{event_id:cohort,name:"page_viewed",path,props:{visitor_country:"spoofed",visitor_market:"spoofed",localization_cohort:"spoofed",content_locale:"pt-BR"}}});
      expect(capture.mock.calls.at(-1)![0].properties).toMatchObject({visitor_country:country,visitor_market:market,localization_cohort:cohort});
    }
    await ingestAnalyticsEvents({body:{name:"page_viewed",path:"/es/editor",props:{visitor_country:"ES"}}});
    expect(capture.mock.calls.at(-1)![0].properties).toMatchObject({visitor_country:"unknown",localization_cohort:"es:unknown"});
  });
  it("preserves job and editor correlation from properties in both event formats", async () => {
    await ingestAnalyticsEvents({ accountId: "owner", body: { events: [
      { event_id: "import-1", name: "transcription_imported_to_editor", props: { job_id: "job-1", editor_id: "editor-1" } },
      { event_id: "import-2", event: "transcribe_success", payload: { jobId: "job-2", editorId: "editor-2" } },
    ] } });
    expect(capture.mock.calls[0][0].properties).toMatchObject({ job_id: "job-1", editor_id: "editor-1" });
    expect(capture.mock.calls[1][0].properties).toMatchObject({ job_id: "job-2", editor_id: "editor-2" });
  });

  it("uses stable capture UUIDs and timestamps when retrying", async () => {
    const input = { accountId: "owner", body: { name: "transcription_succeeded", event_id: "succeeded:job-1", ts: "2026-10-07T12:00:00.000Z" } };
    await ingestAnalyticsEvents(input);
    await ingestAnalyticsEvents(input);
    expect(capture.mock.calls[0][0].uuid).toMatch(/^[a-f0-9-]{36}$/);
    expect(capture.mock.calls[0][0].uuid).toBe(capture.mock.calls[1][0].uuid);
    expect(capture.mock.calls[0][0].timestamp).toEqual(capture.mock.calls[1][0].timestamp);
  });

  it("does not acknowledge delivery before flush finishes", async () => {
    flush.mockRejectedValueOnce(new Error("Capture unavailable"));
    await expect(ingestAnalyticsEvents({ body: { name: "transcription_succeeded" } })).rejects.toThrow("Capture unavailable");
  });
  beforeEach(() => {
    capture.mockClear();
    flush.mockClear();
    vi.unstubAllEnvs();
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
    expect(flush).toHaveBeenCalledOnce();
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

  it("uses the trusted visitor IP and edge geography on Vercel", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    await ingestAnalyticsEvents({
      req: {
        headers: {
          "x-vercel-forwarded-for": "2a00:1450:400f:80d::200e",
          "x-forwarded-for": "203.0.113.10",
          "x-vercel-ip-country": "se",
          "x-vercel-ip-continent": "eu",
        },
      } as any,
      cookies: { analytics_consent: "granted" },
      body: {
        event_id: "geo_123",
        name: "page_viewed",
        ts: "2026-08-25T12:34:56.000Z",
        props: {
          $ip: "198.51.100.20",
          $geoip_country_code: "US",
          environment: "spoofed",
        },
      },
    });

    expect(capture).toHaveBeenCalledWith(
      expect.objectContaining({
        timestamp: new Date("2026-08-25T12:34:56.000Z"),
        properties: expect.objectContaining({
          $ip: "2a00:1450:400f:80d::200e",
          $geoip_country_code: "SE",
          $geoip_continent_code: "EU",
          environment: "production",
          analytics_transport: "server_proxy",
          analytics_geo_source: "vercel_edge",
          analytics_geo_version: 2,
        }),
      })
    );
  });

  it("does not trust forwarded geography outside Vercel", async () => {
    await ingestAnalyticsEvents({
      req: {
        headers: {
          "x-forwarded-for": "203.0.113.10",
          "x-vercel-ip-country": "US",
        },
      } as any,
      cookies: { analytics_consent: "granted" },
      body: {
        event_id: "untrusted_geo_123",
        name: "page_viewed",
        props: { $ip: "198.51.100.20", $geoip_country_code: "US" },
      },
    });

    const properties = capture.mock.calls[0]?.[0]?.properties;
    expect(properties).not.toHaveProperty("$ip");
    expect(properties).not.toHaveProperty("$geoip_country_code");
    expect(properties).not.toHaveProperty("analytics_geo_source");
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
      req: {
        headers: {
          host: "www.note2tabs.com",
          "x-forwarded-proto": "https",
        },
      } as any,
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
      $host: "www.note2tabs.com",
      $referrer: "https://google.com",
      $referring_domain: "google.com",
      error_code: "backend_failed",
    });
    expect(properties.$current_url).not.toContain("private-token");
    expect(properties).not.toHaveProperty("email");
    expect(properties).not.toHaveProperty("name");
    expect(properties).not.toHaveProperty("error");
  });
});
