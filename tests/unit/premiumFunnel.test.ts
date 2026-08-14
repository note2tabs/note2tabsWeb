import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getOrCreatePremiumFunnelContext,
  normalizePremiumFunnelId,
  normalizePremiumFunnelReason,
  normalizePremiumFunnelSource,
  premiumPricingHref,
  readPremiumFunnelContext,
} from "../../lib/premiumFunnel";

class MemoryStorage {
  private values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }

  removeItem(key: string) {
    this.values.delete(key);
  }
}

describe("Premium funnel context", () => {
  beforeEach(() => {
    vi.stubGlobal("window", { sessionStorage: new MemoryStorage() });
    vi.stubGlobal("crypto", { randomUUID: () => "generated-funnel-id" });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("normalizes untrusted source, reason, and identifiers", () => {
    expect(normalizePremiumFunnelSource("low_credits")).toBe("low_credits");
    expect(normalizePremiumFunnelSource("made-up")).toBe("unknown");
    expect(normalizePremiumFunnelReason("Large file / limit")).toBe("large_file_limit");
    expect(normalizePremiumFunnelId("short")).toBeNull();
    expect(normalizePremiumFunnelId("funnel_valid_123")).toBe("funnel_valid_123");
  });

  it("keeps one correlation id through a matching pricing handoff", () => {
    const created = getOrCreatePremiumFunnelContext({
      source: "premium_prompt",
      reason: "low_credits",
      funnelId: "funnel_prompt_123",
    });
    const resumed = getOrCreatePremiumFunnelContext({
      source: "premium_prompt",
      reason: "low_credits",
      funnelId: "funnel_prompt_123",
    });

    expect(resumed).toEqual(created);
    expect(readPremiumFunnelContext()).toEqual(created);
    expect(premiumPricingHref(created)).toBe(
      "/pricing?source=premium_prompt&reason=low_credits&funnel_id=funnel_prompt_123"
    );
  });
});
