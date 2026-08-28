import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = fs.readFileSync(
  path.join(process.cwd(), "components/AdvertisementSlot.tsx"),
  "utf8"
);

describe("advertisement dismissal", () => {
  it("keeps ads hidden for ten minutes", () => {
    expect(source).toContain("const DISMISS_DURATION_MS = 10 * 60 * 1000");
  });

  it("offers a short, frequency-limited ad-free Premium suggestion", () => {
    expect(source).toContain("const AD_FREE_PROMPT_DURATION_MS = 8 * 1000");
    expect(source).toContain("const AD_FREE_PROMPT_FREQUENCY_MS = 7 * 24 * 60 * 60 * 1000");
    expect(source).toContain("Prefer an ad-free workspace?");
    expect(source).toContain("ad_dismissal_inline");
  });
});
