import { describe, it, expect } from "vitest";
import { parseUserAgent } from "../../lib/analyticsV2/ua";
describe("checkout browser context", () => {
  it.each([
    [
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1",
      "safari",
      "ios",
    ],
    [
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 CriOS/130.0 Mobile/15E148 Safari/604.1",
      "chrome",
      "ios",
    ],
    [
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 Chrome/130.0 Safari/537.36",
      "chrome",
      "macos",
    ],
    [
      "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36",
      "chrome",
      "android",
    ],
  ])("classifies %s without confusing iOS with macOS", (ua, browser, os) => {
    expect(parseUserAgent(ua)).toMatchObject({ browser, os });
  });
});
