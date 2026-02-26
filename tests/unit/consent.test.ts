import { describe, expect, it } from "vitest";
import { getConsentFromCookies } from "../../lib/analyticsV2/cookies";
import { isConsentDenied } from "../../lib/analyticsV2/consent";

describe("consent gating", () => {
  it("treats missing consent cookie as granted", () => {
    expect(getConsentFromCookies({})).toBe("granted");
    expect(isConsentDenied({})).toBe(false);
  });

  it("treats granted cookie as granted", () => {
    expect(getConsentFromCookies({ analytics_consent: "granted" })).toBe("granted");
    expect(isConsentDenied({ analytics_consent: "granted" })).toBe(false);
  });

  it("blocks when consent is denied", () => {
    expect(getConsentFromCookies({ analytics_consent: "denied" })).toBe("denied");
    expect(isConsentDenied({ analytics_consent: "denied" })).toBe(true);
  });
});
