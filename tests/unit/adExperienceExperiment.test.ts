import { describe, expect, it } from "vitest";
import { normalizeAdExperienceVariant } from "../../lib/adExperienceExperiment";

describe("ad experience experiment", () => {
  it("keeps the no-ad control explicit", () => {
    expect(normalizeAdExperienceVariant("control")).toBe("control");
  });

  it("uses the discreet treatment for configured and missing values", () => {
    expect(normalizeAdExperienceVariant("discreet-dismissible")).toBe("discreet-dismissible");
    expect(normalizeAdExperienceVariant(undefined)).toBe("discreet-dismissible");
  });
});
