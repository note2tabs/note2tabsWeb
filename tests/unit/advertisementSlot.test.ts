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

  it("offers a short ad-free Premium suggestion once per dismissal cycle", () => {
    expect(source).toContain("const AD_FREE_PROMPT_DURATION_MS = 4 * 1000");
    expect(source).toContain("const AD_FREE_PROMPT_FREQUENCY_MS = DISMISS_DURATION_MS");
    expect(source).toContain("Prefer an ad-free workspace?");
    expect(source).toContain("ad_dismissal_inline");
  });
});
