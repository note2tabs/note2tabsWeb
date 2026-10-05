import { describe, expect, it } from "vitest";
import { getInitialPremiumPromptReason } from "../../components/PremiumUpgradePrompt";

describe("PremiumUpgradePrompt", () => {
  it("does not interrupt a first-session transcription passively", () => {
    expect(getInitialPremiumPromptReason("/transcribe", 9)).toBeNull();
    expect(getInitialPremiumPromptReason("/transcriber", 9)).toBeNull();
    expect(getInitialPremiumPromptReason("/home", 9)).toBeNull();
  });

  it("offers Premium to an eligible returning user only in the transcriber", () => {
    expect(getInitialPremiumPromptReason("/transcribe", 9, true)).toBe("returning_user");
    expect(getInitialPremiumPromptReason("/transcriber", 9, true)).toBe("returning_user");
    expect(getInitialPremiumPromptReason("/home", 9, true)).toBeNull();
  });

  it("keeps urgent credit prompts ahead of the passive offer", () => {
    expect(getInitialPremiumPromptReason("/transcriber", 0)).toBe("no_credits");
    expect(getInitialPremiumPromptReason("/transcriber", 3)).toBe("low_credits");
    expect(getInitialPremiumPromptReason("/settings", 0)).toBeNull();
  });
});
