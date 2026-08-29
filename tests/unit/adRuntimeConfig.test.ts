import { afterEach, describe, expect, it } from "vitest";
import { getAdRuntimeConfig, isAdRuntimeConfigured } from "../../lib/ads/config";
import { hasAdFreeEntitlement, isAdInteractionEligible } from "../../lib/ads/eligibility";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("advertising interaction eligibility", () => {
  const base = {
    documentVisible: true,
    visibleRatio: 0.5,
    minVisibleRatio: 0.5,
    lastActivityAt: 50_000,
    idleAfterMs: 60_000,
    now: 100_000,
  };

  it("allows a meaningfully visible slot with recent activity", () => {
    expect(isAdInteractionEligible(base)).toBe(true);
  });

  it("rejects background, off-screen and inactive inventory", () => {
    expect(isAdInteractionEligible({ ...base, documentVisible: false })).toBe(false);
    expect(isAdInteractionEligible({ ...base, visibleRatio: 0.49 })).toBe(false);
    expect(isAdInteractionEligible({ ...base, lastActivityAt: 0 })).toBe(false);
  });
});

describe("advertising account eligibility", () => {
  it("keeps every privileged subscription role ad-free", () => {
    expect(hasAdFreeEntitlement("PREMIUM")).toBe(true);
    expect(hasAdFreeEntitlement("admin")).toBe(true);
    expect(hasAdFreeEntitlement("MODERATOR")).toBe(true);
    expect(hasAdFreeEntitlement("FREE")).toBe(false);
    expect(hasAdFreeEntitlement(undefined)).toBe(false);
  });
});

describe("advertising runtime configuration", () => {
  it("is fail-closed without an explicitly configured provider", () => {
    delete process.env.NEXT_PUBLIC_ADS_ENABLED;
    delete process.env.NEXT_PUBLIC_AD_PROVIDER;
    delete process.env.NEXT_PUBLIC_AD_UNIT_EDITOR;
    const config = getAdRuntimeConfig("editor");
    expect(config.enabled).toBe(false);
    expect(config.refreshEnabled).toBe(false);
    expect(isAdRuntimeConfigured(config)).toBe(false);
  });

  it("never configures refresh below the conservative sixty-second floor", () => {
    process.env.NEXT_PUBLIC_AD_REFRESH_SECONDS = "30";
    expect(getAdRuntimeConfig("editor").refreshSeconds).toBe(60);
  });

  it("supports a placement kill switch", () => {
    process.env.NEXT_PUBLIC_ADS_ENABLED = "true";
    process.env.NEXT_PUBLIC_ADS_DISABLED_PLACEMENTS = "editor,editor-practice";
    expect(getAdRuntimeConfig("editor").enabled).toBe(false);
    expect(getAdRuntimeConfig("transcription-loading").enabled).toBe(true);
  });

  it("supports conservative placement-specific refresh strategies", () => {
    process.env.NEXT_PUBLIC_AD_REFRESH_SECONDS = "90";
    process.env.NEXT_PUBLIC_AD_REFRESH_SECONDS_EDITOR = "180";
    process.env.NEXT_PUBLIC_AD_REFRESH_ENABLED = "false";
    process.env.NEXT_PUBLIC_AD_REFRESH_ENABLED_EDITOR = "true";

    expect(getAdRuntimeConfig("editor").refreshSeconds).toBe(180);
    expect(getAdRuntimeConfig("editor").refreshEnabled).toBe(true);
    expect(getAdRuntimeConfig("transcription-loading").refreshSeconds).toBe(90);
    expect(getAdRuntimeConfig("transcription-loading").refreshEnabled).toBe(false);
  });
});
