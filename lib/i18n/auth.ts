import { signIn, type SignInOptions } from "next-auth/react";
import { localeFromPath, localeHref } from "./locale";
import { normalizeSafeReturnPath } from "../safeReturnPath";
/** Use the branded localized login instead of NextAuth's English provider picker. */
export function localizedSignIn(provider?: string, options?: SignInOptions) {
  const locale = typeof window === "undefined" ? "en" : localeFromPath(window.location.pathname);
  if (locale === "pt-BR" && !provider) {
    const next = localeHref(normalizeSafeReturnPath(options?.callbackUrl, "/transcribe"), locale);
    window.location.assign(`/pt-br/auth/login?next=${encodeURIComponent(next)}`);
    return Promise.resolve(undefined);
  }
  return signIn(provider, options);
}
