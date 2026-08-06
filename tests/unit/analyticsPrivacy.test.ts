import { describe, expect, it } from "vitest";
import {
  categorizeAnalyticsDestination,
  sanitizeAnalyticsPathname,
  sanitizeAnalyticsProperties,
  sanitizeAnalyticsUrl,
  sanitizePostHogCapture,
} from "../../lib/analyticsPrivacy";
import { categorizeAnalyticsError } from "../../lib/analyticsErrors";

describe("analytics privacy sanitization", () => {
  it("removes queries and templates private routes", () => {
    expect(
      sanitizeAnalyticsUrl(
        "https://note2tabs.com/reset-password/super-secret-token?email=user@example.com#done"
      )
    ).toBe("https://note2tabs.com/reset-password/[token]");
    expect(
      sanitizeAnalyticsPathname(
        "/auth/verify-email?token=secret&email=user@example.com"
      )
    ).toBe("/auth/verify-email");
    expect(sanitizeAnalyticsPathname("/gte/private-editor/import-tab?source=job")).toBe(
      "/gte/[editor_id]/import-tab"
    );
    expect(sanitizeAnalyticsPathname("/blog/how-to-read-tabs?utm_source=google")).toBe(
      "/blog/how-to-read-tabs"
    );
  });

  it("scrubs sensitive and unbounded properties recursively", () => {
    const sanitized = sanitizeAnalyticsProperties({
      $current_url: "https://note2tabs.com/auth/verify-email?token=secret&email=a@b.com",
      $referrer: "https://google.com/search?q=private+query",
      email: "person@example.com",
      name: "Private Person",
      ytUrl: "https://youtube.com/watch?v=secret-video-id",
      error: "raw upstream body with arbitrary customer data",
      error_code: "Backend request failed!!!",
      $elements: [
        {
          attr__href: "/reset-password/another-secret?email=person@example.com",
        },
      ],
    });

    expect(sanitized).toMatchObject({
      $current_url: "https://note2tabs.com/auth/verify-email",
      $referrer: "https://google.com",
      error_code: "backend_request_failed",
      $elements: [{ attr__href: "/reset-password/[token]" }],
    });
    expect(sanitized).not.toHaveProperty("email");
    expect(sanitized).not.toHaveProperty("name");
    expect(sanitized).not.toHaveProperty("ytUrl");
    expect(sanitized).not.toHaveProperty("error");
  });

  it("sanitizes identify properties and drops automatic exception payloads", () => {
    const identify = sanitizePostHogCapture({
      uuid: "event-id",
      event: "$identify",
      properties: {
        $current_url: "https://note2tabs.com/settings?session=secret",
      },
      $set: { email: "person@example.com", plan: "PREMIUM" },
    });

    expect(identify?.properties.$current_url).toBe("https://note2tabs.com/settings");
    expect(identify?.$set).toEqual({ plan: "premium" });
    expect(
      sanitizePostHogCapture({
        uuid: "exception-id",
        event: "$exception",
        properties: { $exception_message: "private error" },
      })
    ).toBeNull();
  });

  it("uses bounded funnel dimensions instead of destinations and errors", () => {
    expect(categorizeAnalyticsDestination("/transcribe?resumeTranscription=1")).toBe(
      "transcriber"
    );
    expect(categorizeAnalyticsDestination("/gte/private-id?source=job")).toBe("editor");
    expect(categorizeAnalyticsError("An account with this email already exists.")).toBe(
      "account_exists"
    );
    expect(categorizeAnalyticsError("opaque upstream customer text", "backend_failed")).toBe(
      "backend_failed"
    );
  });
});
