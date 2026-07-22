import { describe, expect, it } from "vitest";
import {
  INDEX_ROBOTS_DIRECTIVE,
  ORGANIZATION_ID,
  SITE_IDENTITY_JSON_LD,
  SITE_LOGO_URL,
  WEBSITE_ID,
  absoluteUrl,
} from "../../components/SeoHead";

describe("SEO URL helpers", () => {
  it("preserves query parameters used by dynamic social images", () => {
    expect(absoluteUrl("/api/og?title=How%20to%20Play#preview")).toBe(
      "https://www.note2tabs.com/api/og?title=How%20to%20Play#preview"
    );
  });

  it("publishes one consistent brand identity for Google site names", () => {
    const organization = SITE_IDENTITY_JSON_LD.find((item) => item["@type"] === "Organization");
    const website = SITE_IDENTITY_JSON_LD.find((item) => item["@type"] === "WebSite");

    expect(organization).toMatchObject({
      "@id": ORGANIZATION_ID,
      name: "Note2Tabs",
      logo: { url: SITE_LOGO_URL, width: 512, height: 512 },
    });
    expect(website).toMatchObject({
      "@id": WEBSITE_ID,
      name: "Note2Tabs",
      alternateName: "note2tabs.com",
      publisher: { "@id": ORGANIZATION_ID },
    });
  });

  it("allows full-quality snippets and image previews on indexable pages", () => {
    expect(INDEX_ROBOTS_DIRECTIVE).toContain("max-image-preview:large");
    expect(INDEX_ROBOTS_DIRECTIVE).toContain("max-snippet:-1");
  });
});
