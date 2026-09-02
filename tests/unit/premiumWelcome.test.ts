import { describe, expect, it } from "vitest";
import {
  isResumingTranscription,
  premiumWelcomeDestination,
  premiumWelcomePreviewAllowed,
} from "../../lib/premiumWelcome";

describe("premium welcome destinations", () => {
  it("defaults to the transcriber", () => {
    expect(premiumWelcomeDestination(undefined)).toBe("/transcribe");
  });

  it("preserves a pending transcription and fragment", () => {
    const destination = premiumWelcomeDestination("/?resumeTranscription=1#hero");
    expect(destination).toBe("/?resumeTranscription=1#hero");
    expect(isResumingTranscription(destination)).toBe(true);
  });

  it("allows editor destinations", () => {
    expect(premiumWelcomeDestination("/gte/editor_123")).toBe("/gte/editor_123");
  });

  it("rejects external and unrelated destinations", () => {
    expect(premiumWelcomeDestination("https://example.com/steal")).toBe("/transcribe");
    expect(premiumWelcomeDestination("//example.com/steal")).toBe("/transcribe");
    expect(premiumWelcomeDestination("/admin/affiliates")).toBe("/transcribe");
  });
});

describe("premium welcome preview", () => {
  it("is available for preview deployments and local development", () => {
    expect(premiumWelcomePreviewAllowed("preview", "production")).toBe(true);
    expect(premiumWelcomePreviewAllowed(undefined, "development")).toBe(true);
  });

  it("cannot be enabled in production", () => {
    expect(premiumWelcomePreviewAllowed("production", "production")).toBe(false);
  });
});
