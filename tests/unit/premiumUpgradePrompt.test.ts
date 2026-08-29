import { describe, expect, it } from "vitest";
import { getInitialPremiumPromptReason } from "../../components/PremiumUpgradePrompt";

describe("PremiumUpgradePrompt", () => {
  it("offers Premium passively only inside the transcriber", () => {
    expect(getInitialPremiumPromptReason("/transcribe", 9)).toBe(
      "transcriber_passive"
    );
    expect(getInitialPremiumPromptReason("/transcriber", 9)).toBe(
      "transcriber_passive"
    );
    expect(getInitialPremiumPromptReason("/home", 9)).toBeNull();
  });

  it("keeps urgent credit prompts ahead of the passive offer", () => {
    expect(getInitialPremiumPromptReason("/transcriber", 0)).toBe("no_credits");
    expect(getInitialPremiumPromptReason("/transcriber", 3)).toBe("low_credits");
  });
});
