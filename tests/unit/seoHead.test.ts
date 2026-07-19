import { describe, expect, it } from "vitest";
import { absoluteUrl } from "../../components/SeoHead";

describe("SEO URL helpers", () => {
  it("preserves query parameters used by dynamic social images", () => {
    expect(absoluteUrl("/api/og?title=How%20to%20Play#preview")).toBe(
      "https://www.note2tabs.com/api/og?title=How%20to%20Play#preview"
    );
  });
});
