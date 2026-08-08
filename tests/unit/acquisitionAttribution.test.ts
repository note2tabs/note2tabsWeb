import { describe, expect, it } from "vitest";
import {
  classifyAcquisition,
  parseAcquisitionAttribution,
} from "../../lib/acquisitionAttribution";

const classify = (url: string, referrer = "") =>
  classifyAcquisition({ url, referrer, hostname: "www.note2tabs.com" });

describe("acquisition attribution", () => {
  it("classifies search and AI referrers by their actual domains", () => {
    expect(classify("https://www.note2tabs.com/", "https://www.google.com/search?q=tabs")).toMatchObject({
      first_touch_source: "google",
      first_touch_medium: "organic_search",
      first_touch_referring_domain: "google.com",
    });
    expect(classify("https://www.note2tabs.com/editor", "https://chatgpt.com/")).toMatchObject({
      first_touch_source: "chatgpt",
      first_touch_medium: "ai_assistant",
    });
  });

  it("uses tagged social campaigns even when an app strips the referrer", () => {
    expect(
      classify("https://www.note2tabs.com/?utm_source=instagram&utm_medium=social&utm_campaign=bio")
    ).toMatchObject({
      first_touch_source: "instagram",
      first_touch_medium: "social",
      first_touch_campaign: "bio",
    });
  });

  it("does not mistake OAuth returns or internal pages for new direct acquisition", () => {
    expect(
      classify("https://www.note2tabs.com/auth/login", "https://accounts.google.com/")
    ).toMatchObject({
      first_touch_source: "returning_unknown",
      first_touch_medium: "internal_return",
    });
    expect(classify("https://www.note2tabs.com/gte/private-id")).toMatchObject({
      first_touch_source: "returning_unknown",
    });
  });

  it("keeps genuine untagged homepage visits as direct", () => {
    expect(classify("https://www.note2tabs.com/")).toMatchObject({
      first_touch_source: "direct",
      first_touch_medium: "direct",
      first_touch_landing_path: "/",
    });
  });

  it("rejects malformed attribution cookies and normalizes valid values", () => {
    expect(parseAcquisitionAttribution("not-json")).toBeNull();
    expect(
      parseAcquisitionAttribution(
        JSON.stringify({
          first_touch_source: "Instagram Ads",
          first_touch_medium: "Paid Social",
          first_touch_referring_domain: "L.Instagram.com",
          first_touch_landing_path: "/gte/private-id?secret=yes",
          first_touch_campaign: "Summer Launch",
        })
      )
    ).toEqual({
      first_touch_source: "instagram_ads",
      first_touch_medium: "paid_social",
      first_touch_referring_domain: "l.instagram.com",
      first_touch_landing_path: "/gte/[editor_id]",
      first_touch_campaign: "summer_launch",
    });
  });
});
