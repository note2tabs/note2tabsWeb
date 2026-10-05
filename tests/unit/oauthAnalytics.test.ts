import { afterEach, describe, expect, it, vi } from "vitest";
import { saveOAuthIntent, takeOAuthIntent } from "../../lib/oauthAnalytics";

function createSessionStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  };
}

describe("OAuth analytics intent", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("preserves signup-dialog attribution through an OAuth redirect", () => {
    const sessionStorage = createSessionStorage();
    vi.stubGlobal("window", { sessionStorage });

    saveOAuthIntent("signup", "/?resumeTranscription=1&source=transcription_signup_dialog", {
      surface: "transcription_signup_dialog",
      mode: "YOUTUBE",
    });

    expect(takeOAuthIntent()).toMatchObject({
      intent: "signup",
      next: "/?resumeTranscription=1&source=transcription_signup_dialog",
      surface: "transcription_signup_dialog",
      mode: "YOUTUBE",
    });
    expect(takeOAuthIntent()).toBeNull();
  });

  it("keeps existing two-argument callers backwards-compatible", () => {
    const sessionStorage = createSessionStorage();
    vi.stubGlobal("window", { sessionStorage });

    saveOAuthIntent("login", "/home");

    expect(takeOAuthIntent()).toMatchObject({ intent: "login", next: "/home" });
  });
});
