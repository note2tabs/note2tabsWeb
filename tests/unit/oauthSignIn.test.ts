import { afterEach, describe, expect, it, vi } from "vitest";
import { signIn } from "next-auth/react";
import { startGoogleSignIn } from "../../lib/oauthSignIn";
import { takeOAuthIntent } from "../../lib/oauthAnalytics";

vi.mock("next-auth/react", () => ({ signIn: vi.fn() }));
afterEach(() => { vi.unstubAllGlobals(); vi.resetAllMocks(); });

function session() {
  const data = new Map<string, string>();
  vi.stubGlobal("window", { sessionStorage: {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => data.set(key, value),
    removeItem: (key: string) => data.delete(key),
  } });
}

describe("Google sign-in startup", () => {
  it.each(["login", "signup"] as const)("handles a rejected %s request and permits retry", async intent => {
    session();
    vi.mocked(signIn).mockRejectedValueOnce(new TypeError("Load failed"));
    expect(await startGoogleSignIn(intent, "/es/transcribe?resumeTranscription=1")).toBe(false);
    expect(takeOAuthIntent()).toBeNull();
    vi.mocked(signIn).mockResolvedValueOnce(undefined);
    expect(await startGoogleSignIn(intent, "/es/transcribe?resumeTranscription=1")).toBe(true);
    expect(signIn).toHaveBeenLastCalledWith("google", {callbackUrl: "/es/transcribe?resumeTranscription=1"});
    expect(takeOAuthIntent()).toMatchObject({intent, next: "/es/transcribe?resumeTranscription=1"});
  });

  it("handles an explicit provider error as a failed startup", async () => {
    session();
    vi.mocked(signIn).mockResolvedValueOnce({error: "OAuthSignin", status: 500, ok: false, url: null});
    expect(await startGoogleSignIn("login", "/home")).toBe(false);
    expect(takeOAuthIntent()).toBeNull();
  });

  it("still starts sign-in when analytics storage is unavailable", async () => {
    vi.stubGlobal("window", {get sessionStorage() {throw new Error("Storage blocked");}});
    vi.mocked(signIn).mockResolvedValueOnce(undefined);
    expect(await startGoogleSignIn("login", "/home")).toBe(true);
    expect(signIn).toHaveBeenCalledOnce();
  });
});
