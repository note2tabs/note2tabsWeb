import { signIn, type SignInOptions } from "next-auth/react";
import { localeFromPath, localeHref, navigationLocaleForPath, preferredLocaleFromCookie, localeEnabled } from "./locale";
import { normalizeSafeReturnPath } from "../safeReturnPath";
/** Use the branded localized login instead of NextAuth's English provider picker. */
export function localizedSignIn(provider?: string, options?: SignInOptions) {
  const locale = typeof window === "undefined" ? "en" : navigationLocaleForPath(window.location.pathname, preferredLocaleFromCookie(document.cookie));
  if (localeEnabled(locale) && locale !== "en" && !provider) {
    const next = localeHref(normalizeSafeReturnPath(options?.callbackUrl, "/transcribe"), locale);
    window.location.assign(`${localeHref("/auth/login", locale)}?next=${encodeURIComponent(next)}`);
    return Promise.resolve(undefined);
  }
  return signIn(provider, options);
}
