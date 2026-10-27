import { describe, expect, it } from "vitest";
import { matchesAccountDeletionConfirmation } from "../../lib/accountDeletionConfirmation";
import { ALL_LOCALES } from "../../lib/i18n/locale";
import fs from "node:fs";
import path from "node:path";

describe("localized account deletion confirmation", () => {
  it.each(ALL_LOCALES)("uses the displayed local word consistently in %s", locale => {
    const catalog = JSON.parse(fs.readFileSync(path.join(process.cwd(), "lib/i18n", `${locale}.json`), "utf8"));
    const word = catalog["Account deletion confirmation word"];
    expect(word).toBeTruthy();
    expect(matchesAccountDeletionConfirmation(` ${word.toUpperCase()} `, word)).toBe(true);
    expect(matchesAccountDeletionConfirmation("", word)).toBe(false);
    expect(matchesAccountDeletionConfirmation(word + "x", word)).toBe(false);
    if (locale !== "en") expect(matchesAccountDeletionConfirmation("delete", word)).toBe(false);
    for (const key of ["Type {word} to confirm", "This permanently removes your account, saved tabs, transcription history, and active subscription. Type {word} to confirm."]) {
      expect(catalog[key]).toContain("{word}");
      expect(catalog[key].replace("{word}", word)).toContain(word);
    }
  });
  it("accepts Japanese IME spacing and full-width Latin characters", () => {
    expect(matchesAccountDeletionConfirmation("　削除　", "削除")).toBe(true);
    expect(matchesAccountDeletionConfirmation("ＤＥＬＥＴＥ", "delete")).toBe(true);
    expect(matchesAccountDeletionConfirmation("delete", "削除")).toBe(false);
    expect(matchesAccountDeletionConfirmation("", "")).toBe(false);
  });
});
