import { describe, it, expect } from "vitest";
import { limitUpgradePlan } from "../../lib/limitUpgrade";
import { ALL_LOCALES } from "../../lib/i18n/locale";
import { serverPublicCatalogs } from "../../lib/i18n/publicCatalogs.server";
const MB = 1024 * 1024;
describe("limit upgrade plan selection", () => {
  it.each([
    [82, "PREMIUM"],
    [200, "PREMIUM"],
    [201, "PRO"],
    [320, "PRO"],
    [500, "PRO"],
    [501, null],
  ])("offers a plan that fits %s MB", (size, plan) =>
    expect(
      limitUpgradePlan("file_size_limit", {
        plan: "FREE",
        fileBytes: Number(size) * MB,
      }),
    ).toBe(plan),
  );
  it("offers Pro to Premium customers, and never sells Premium twice", () => {
    expect(
      limitUpgradePlan("credits_exhausted", {
        plan: "PREMIUM",
        remaining: 0,
        required: 30,
      }),
    ).toBe("PRO");
    expect(
      limitUpgradePlan("file_size_limit", {
        plan: "PREMIUM",
        fileBytes: 320 * MB,
      }),
    ).toBe("PRO");
  });
  it("never offers an upgrade to Pro customers", () =>
    expect(
      limitUpgradePlan("credits_exhausted", { plan: "PRO", remaining: 0 }),
    ).toBeNull());
  it.each([
    [90, "PREMIUM"],
    [600, "PREMIUM"],
    [601, "PRO"],
    [1200, "PRO"],
    [1201, null],
  ])("fits a %s second YouTube clip", (seconds, plan) =>
    expect(
      limitUpgradePlan("youtube_duration_limit", {
        plan: "FREE",
        clipSeconds: Number(seconds),
      }),
    ).toBe(plan),
  );
  it("does not promise enough credits when the new allowance is insufficient", () => {
    expect(
      limitUpgradePlan("credits_exhausted", { plan: "FREE", required: 101 }),
    ).toBe("PRO");
    expect(
      limitUpgradePlan("credits_exhausted", {
        plan: "PREMIUM",
        required: 251,
        remaining: 20,
      }),
    ).toBeNull();
  });
  it("has translated critical content and consistent placeholders in every language", () => {
    const keys = [
      "Your file is too large",
      "Your YouTube section is too long",
      "Your file is {size} MB. Your plan’s upload limit is {limit} MB.",
      "This transcription needs {required} credits. You have {remaining} left.",
      "YouTube length limit: {minutes} minutes",
      "Get {plan} — {price}/month",
      "Compare plans",
      "Back to transcriber",
    ];
    for (const locale of ALL_LOCALES.filter((l) => l !== "en"))
      for (const key of keys) {
        const value = serverPublicCatalogs[locale][key];
        expect(value, `${locale}: ${key}`).toBeTruthy();
        expect(value.match(/\{\w+\}/g)?.sort() || []).toEqual(
          key.match(/\{\w+\}/g)?.sort() || [],
        );
      }
  });
});

it("does not sell Premium for a file excerpt whose credit cost requires Pro",()=>{expect(limitUpgradePlan('file_size_limit',{plan:'FREE',fileBytes:82*MB,required:150})).toBe('PRO');});
