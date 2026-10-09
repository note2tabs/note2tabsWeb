import { describe, expect, it } from "vitest";

import { isMobileGteDevice } from "../../lib/gteMobileDevice";

describe("mobile GTE device detection", () => {
  it("keeps desktop browsers in desktop GTE regardless of viewport size", () => {
    expect(isMobileGteDevice({
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36",
      maxTouchPoints: 0,
    })).toBe(false);
  });

  it("uses the browser mobile client hint when available", () => {
    expect(isMobileGteDevice({
      userAgent: "Mozilla/5.0 (Linux; Android 16; Pixel 10)",
      userAgentData: { mobile: true },
    })).toBe(true);
    expect(isMobileGteDevice({
      userAgent: "Mozilla/5.0 (Linux; Android 16)",
      userAgentData: { mobile: false },
    })).toBe(false);
  });

  it.each([
    "Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148",
    "Mozilla/5.0 (Linux; Android 16; Pixel 10 Pro) AppleWebKit/537.36 Mobile Safari/537.36",
    "Mozilla/5.0 (Linux; Android 16; SM-X900) AppleWebKit/537.36 Safari/537.36",
    "Mozilla/5.0 (iPad; CPU OS 19_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148",
  ])("enables mobile GTE for mobile and tablet user agents", (userAgent) => {
    expect(isMobileGteDevice({ userAgent })).toBe(true);
  });

  it("recognizes an iPad using its desktop-style user agent", () => {
    expect(isMobileGteDevice({
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Safari/605.1.15",
      maxTouchPoints: 5,
    })).toBe(true);
  });

  it("does not classify an ordinary Mac as mobile", () => {
    expect(isMobileGteDevice({
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 Safari/605.1.15",
      maxTouchPoints: 0,
    })).toBe(false);
  });
});
