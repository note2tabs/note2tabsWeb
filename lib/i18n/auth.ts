import { signIn, type SignInOptions } from "next-auth/react";
import { localeFromPath, localeHref, navigationLocaleForPath, preferredLocaleFromCookie } from "./locale";
import { normalizeSafeReturnPath } from "../safeReturnPath";
/** Use the branded localized login instead of NextAuth's English provider picker. */
export function localizedSignIn(provider?: string, options?: SignInOptions) {
  const locale = typeof window === "undefined" ? "en" : navigationLocaleForPath(window.location.pathname, preferredLocaleFromCookie(document.cookie));
  if (process.env.NEXT_PUBLIC_PT_BR_AVAILABLE === "true" && locale === "pt-BR" && !provider) {
    const next = localeHref(normalizeSafeReturnPath(options?.callbackUrl, "/transcribe"), locale);
    window.location.assign(`/pt-br/auth/login?next=${encodeURIComponent(next)}`);
    return Promise.resolve(undefined);
  }
  return signIn(provider, options);
}
