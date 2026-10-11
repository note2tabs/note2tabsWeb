import { describe, expect, it } from "vitest";
import {
  categorizeAnalyticsDestination,
  sanitizeAnalyticsPathname,
  sanitizeAnalyticsProperties,
  sanitizeAnalyticsUrl,
  sanitizePostHogCapture,
  classifyPostHogException,
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

  it("sanitizes identify properties and retains safe automatic exception payloads", () => {
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
    const exception = sanitizePostHogCapture({
        uuid: "exception-id",
        event: "$exception",
        properties: {
          $current_url: "https://note2tabs.com/gte/private-id?token=secret",
          $exception_message: "private error",
          $exception_list: [{ type: "TypeError", value: "Failed for person@example.com" }],
        },
      });
    expect(exception?.properties.$current_url).toBe("https://note2tabs.com/gte/[editor_id]");
    expect(exception?.properties.$exception_message).toBeUndefined();
    expect(exception?.properties.$exception_list).toEqual([
      { type: "TypeError", value: "Failed for [redacted-email]" },
    ]);
    expect(exception?.properties).toMatchObject({
      alert_eligible: true,
      error_classification: "unexpected_application_error",
    });
  });

  it("keeps unhandled validation, cancellation and observer errors alertable", () => {
    for (const message of [
      "File is too large",
      "Fret number is required",
      "Insufficient credits",
      "AbortError: user cancelled",
      "ResizeObserver loop limit exceeded",
    ]) {
      expect(classifyPostHogException([{ type: "Error", value: message }])).toEqual({
        alertEligible: true,
        classification: "unexpected_application_error",
      });
    }
    expect(classifyPostHogException([{ type: "TypeError", value: "Cannot read properties of undefined" }])).toEqual({
      alertEligible: true,
      classification: "unexpected_application_error",
    });
  });

  it("keeps opaque script errors alertable without assuming they are harmless", () => {
    for (const exception of [
      { type: "Error", value: "Script error." },
      {
        type: "Error",
        value: "Script error.",
        mechanism: {
          exception_id: 0,
          handled: false,
          synthetic: true,
          type: "generic",
        },
      },
    ]) {
      expect(classifyPostHogException([exception])).toEqual({
        alertEligible: true,
        classification: "unexpected_application_error",
      });
    }
  });

  it("keeps short error messages alertable without assuming browser ownership", () => {
    for (const value of ["L", "La", "  La  "]) {
      expect(classifyPostHogException([{ type: "Error", value }])).toEqual({
        alertEligible: true,
        classification: "unexpected_application_error",
      });
    }

    expect(classifyPostHogException([{ type: "TypeError", value: "La" }])).toEqual({
      alertEligible: true,
      classification: "unexpected_application_error",
    });
    expect(classifyPostHogException([{ type: "Error", value: "Lag" }])).toEqual({
      alertEligible: true,
      classification: "unexpected_application_error",
    });
  });

  it("does not hide app failures because of stack filenames or a benign chained exception", () => {
    const failure = { type: "TypeError", value: "Cannot read properties of undefined",
      stacktrace: { frames: [{ in_app: true, source: "/app/quota.ts" }] } };
    const unexpected = { alertEligible: true, classification: "unexpected_application_error" };
    expect(classifyPostHogException([failure])).toEqual(unexpected);
    expect(classifyPostHogException([{ type: "Error", value: "File is too large" }, failure])).toEqual(unexpected);
    expect(classifyPostHogException([failure, { type: "ChunkLoadError", value: "Loading chunk a failed" }])).toEqual(unexpected);
    expect(classifyPostHogException([{ type: "Error", value: "DB", stacktrace: { frames: [{ in_app: true, source: "/app/save.ts", line: 42 }] } }])).toEqual(unexpected);
  });

  it("keeps unknown unhandled network failures alertable", () => {
    for (const value of ["Failed to fetch", "Load failed", "TypeError: Load failed", "NetworkError", "Failed to fetch while offline"]) {
      expect(classifyPostHogException([{ type: "TypeError", value }])).toEqual({
        alertEligible: true, classification: "unexpected_application_error",
      });
    }
  });

  it("does not treat a script error with source context as opaque", () => {
    expect(classifyPostHogException([{type: "Error", value: "Script error.", stacktrace: {frames: [{source: "/_next/static/chunks/app.js", line: 10}]}}])).toEqual({
      alertEligible: true, classification: "unexpected_application_error",
    });
  });

  it("fails open for missing or malformed exception entries", () => {
    for (const list of [null, [], [{}], [null], [{type:"Error",value:"File is too large"}, null]]) {
      expect(classifyPostHogException(list).alertEligible).toBe(true);
    }
  });

  it("keeps real script failures alertable", () => {
    expect(
      classifyPostHogException([{ type: "TypeError", value: "Script error while saving tab" }])
    ).toEqual({
      alertEligible: true,
      classification: "unexpected_application_error",
    });
  });

  it("does not page for injected Safari autofill extension failures", () => {
    expect(
      classifyPostHogException([
        {
          type: "TypeError",
          value:
            'undefined is not an object (evaluating \'(yield this.sendExtensionMessage("getUrlAutofillTargetingRules")).result\')',
        },
      ])
    ).toEqual({
      alertEligible: false,
      classification: "non_actionable_browser_error",
    });
  });

  it("keeps chunk failures alertable even when recovery will be attempted", () => {
    expect(
      classifyPostHogException([
        { type: "ChunkLoadError", value: "Loading chunk 123 failed" },
      ])
    ).toEqual({
      alertEligible: true,
      classification: "unexpected_application_error",
    });
  });

  it("requires exact extension signatures, types and absent source context", () => {
    const value = "Non-Error promise rejection captured with value: Object Not Found Matching Id:1, MethodName:update, ParamCount:4";
    const noise = { type: "UnhandledRejection", value };
    for (const exception of [
      { ...noise, type: "Error" },
      { ...noise, value: `App failed: ${value}` },
      { ...noise, value: `${value}\n` },
      { ...noise, value: value.replace("ParamCount:4", "ParamCount:5") },
      { ...noise, source: "/app/save.ts" },
      { ...noise, stacktrace: { frames: [{ in_app: true }] } },
      { ...noise, stacktrace: { frames: [{ in_app: false }] } },
      { ...noise, stacktrace: { raw: "unknown source" } },
      { ...noise, stacktrace: "unknown format" },
      { type: "TypeError", value: 'sendExtensionMessage("getUrlAutofillTargetingRules") failed' },
    ]) {
      expect(classifyPostHogException([exception]).alertEligible).toBe(true);
    }
    expect(classifyPostHogException([noise, { type: "Error", value: "File is too large" }]).alertEligible).toBe(true);
    expect(classifyPostHogException([noise, undefined]).alertEligible).toBe(true);
    expect(classifyPostHogException(new Array(1)).alertEligible).toBe(true);
    expect(classifyPostHogException([{ ...noise, stacktrace: { frames: [] } }]).alertEligible).toBe(false);
  });

  it("assigns alert eligibility to exceptions with missing or malformed payloads", () => {
    for (const properties of [{}, { $exception_list: null }, { $exception_list: [] }, { alert_eligible: false }]) {
      expect(sanitizePostHogCapture({ uuid: "unknown-error", event: "$exception", properties })?.properties).toMatchObject({
        alert_eligible: true,
        error_classification: "unexpected_application_error",
      });
    }
  });

  it("keeps errors mentioning product states or loader words alertable", () => {
    for (const value of ["quota database failed", "Unauthorized save", "403", "429", "AbortError", "failed to load chunk while saving", "invalid format", "sign in renderer crashed"]) {
      expect(classifyPostHogException([{ type: "Error", value }]).alertEligible).toBe(true);
    }
  });

  it("preserves deeply nested session replay snapshots", () => {
    const snapshot = {
      uuid: "snapshot-id",
      event: "$snapshot",
      properties: {
        $snapshot_data: {
          type: 2,
          data: {
            node: {
              childNodes: [
                {
                  childNodes: [
                    {
                      childNodes: [
                        {
                          childNodes: [
                            { childNodes: [{ textContent: "editor content" }] },
                          ],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          },
        },
      },
    } as any;

    expect(sanitizePostHogCapture(snapshot)).toBe(snapshot);
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

  it("does not alert on Chromium extension message-bridge rejections", () => {
    const classification = classifyPostHogException([
      {
        type: "UnhandledRejection",
        value:
          "Non-Error promise rejection captured with value: Object Not Found Matching Id:1, MethodName:update, ParamCount:4",
      },
    ]);

    expect(classification).toEqual({
      alertEligible: false,
      classification: "non_actionable_browser_error",
    });
  });
});
