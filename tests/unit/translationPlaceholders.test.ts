import { expect, it } from "vitest";
import { catalogs, translate } from "../../lib/i18n/translate";

it("interpolates named count parameters identically with and without a loaded catalog", () => {
  const source = "{notes} notes · {chords} chords";
  const original = catalogs.en;
  try {
    catalogs.en = {};
    expect(translate(source, "en", { notes: 84, chords: 12 })).toBe("84 notes · 12 chords");
    catalogs.en = { [source]: source };
    expect(translate(source, "en", { notes: 84, chords: 12 })).toBe("84 notes · 12 chords");
  } finally {
    catalogs.en = original;
  }
});
