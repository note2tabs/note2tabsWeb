export const CONSENT_PREFERENCES_COOKIE = "note2tabs_consent";
export const ANALYTICS_CONSENT_COOKIE = "analytics_consent";
export const ADVERTISING_CONSENT_COOKIE = "advertising_consent";
export const CONSENT_VERSION = 1;
export const CONSENT_MAX_AGE_SECONDS = 180 * 24 * 60 * 60;

export type ConsentChoice = "granted" | "denied";

export type ConsentPreferences = {
  version: number;
  analytics: ConsentChoice;
  advertising: ConsentChoice;
  updatedAt: string;
};

export function readCookie(name: string) {
  if (typeof document === "undefined") return undefined;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : undefined;
}

export function readConsentPreferences(): ConsentPreferences | null {
  const raw = readCookie(CONSENT_PREFERENCES_COOKIE);
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<ConsentPreferences>;
    if (
      value.version !== CONSENT_VERSION ||
      !["granted", "denied"].includes(value.analytics || "") ||
      !["granted", "denied"].includes(value.advertising || "")
    ) {
      return null;
    }
    return value as ConsentPreferences;
  } catch {
    return null;
  }
}

function writeCookie(name: string, value: string) {
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  const expires = new Date(Date.now() + CONSENT_MAX_AGE_SECONDS * 1000).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; Max-Age=${CONSENT_MAX_AGE_SECONDS}; path=/; SameSite=Lax${secure}`;
}

export function writeConsentPreferences(input: Pick<ConsentPreferences, "analytics" | "advertising">) {
  const preferences: ConsentPreferences = {
    version: CONSENT_VERSION,
    analytics: input.analytics,
    advertising: input.advertising,
    updatedAt: new Date().toISOString(),
  };
  writeCookie(CONSENT_PREFERENCES_COOKIE, JSON.stringify(preferences));
  writeCookie(ANALYTICS_CONSENT_COOKIE, preferences.analytics);
  writeCookie(ADVERTISING_CONSENT_COOKIE, preferences.advertising);
  window.dispatchEvent(new CustomEvent("note2tabs:consent-changed", { detail: preferences }));
  return preferences;
}

export function hasAdvertisingConsent() {
  return readConsentPreferences()?.advertising === "granted";
}
