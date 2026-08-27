import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  CONSENT_VERSION,
  hasAdvertisingConsent,
  readConsentPreferences,
  writeConsentPreferences,
} from "../../lib/consentPreferences";

describe("privacy consent preferences", () => {
  beforeEach(() => {
    vi.stubGlobal("window", { location: { protocol: "https:" }, dispatchEvent: vi.fn() });
    vi.stubGlobal("document", { cookie: "" });
  });

  it("does not infer optional consent from a missing preference", () => {
    expect(readConsentPreferences()).toBeNull();
    expect(hasAdvertisingConsent()).toBe(false);
  });

  it("writes explicit analytics and advertising choices", () => {
    const written: string[] = [];
    Object.defineProperty(document, "cookie", {
      configurable: true,
      get: () => written.map((item) => item.split(";")[0]).join("; "),
      set: (value: string) => written.push(value),
    });

    writeConsentPreferences({ analytics: "denied", advertising: "granted" });

    const saved = readConsentPreferences();
    expect(saved?.version).toBe(CONSENT_VERSION);
    expect(saved?.analytics).toBe("denied");
    expect(saved?.advertising).toBe("granted");
    expect(hasAdvertisingConsent()).toBe(true);
    expect(document.cookie).toContain("analytics_consent=denied");
    expect(document.cookie).toContain("advertising_consent=granted");
  });
});
