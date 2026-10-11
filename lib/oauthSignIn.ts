import { signIn } from "next-auth/react";
import { clearOAuthIntent, saveOAuthIntent, type OAuthIntent } from "./oauthAnalytics";

/** An OAuth startup failure should leave the form usable, with no stale intent. */
export async function startGoogleSignIn(intent: OAuthIntent["intent"], callbackUrl: string): Promise<boolean> {
  saveOAuthIntent(intent, callbackUrl);
  try {
    const result = await signIn("google", { callbackUrl });
    if (!result?.error) return true;
  } catch {
    // The caller displays recovery guidance; no rejected promise escapes the click.
  }
  clearOAuthIntent();
  return false;
}
