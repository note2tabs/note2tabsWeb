import { describe, expect, it } from "vitest";
import { buildVerificationUrl } from "../../lib/emailVerification";
import { normalizeSafeReturnPath } from "../../lib/safeReturnPath";

describe("safe authentication return paths", () => {
  it("preserves an internal transcription handoff", () => {
    expect(normalizeSafeReturnPath("/transcribe?resumeTranscription=1")).toBe(
      "/transcribe?resumeTranscription=1"
    );
  });

  it("rejects external and protocol-relative destinations", () => {
    expect(normalizeSafeReturnPath("https://malicious.example/path")).toBe("/home");
    expect(normalizeSafeReturnPath("//malicious.example/path")).toBe("/home");
    expect(normalizeSafeReturnPath("/\\malicious.example/path")).toBe("/home");
  });

  it("carries the safe return path through the verification link", () => {
    const url = new URL(
      buildVerificationUrl(
        "verify-token",
        "player@example.com",
        "/transcribe?resumeTranscription=1"
      )
    );

    expect(url.pathname).toBe("/auth/verify-email");
    expect(url.searchParams.get("token")).toBe("verify-token");
    expect(url.searchParams.get("email")).toBe("player@example.com");
    expect(url.searchParams.get("next")).toBe(
      "/transcribe?resumeTranscription=1"
    );
  });
});
