import { describe, expect, it } from "vitest";
import {
  DEFAULT_GTE_DISPLAY_PREFERENCES,
  GTE_DISPLAY_PREFERENCES_STORAGE_KEY,
  normalizeGteDisplayPreferences,
  readGteDisplayPreferences,
  writeGteDisplayPreferences,
} from "../../lib/gteDisplayPreferences";

describe("gte display preferences", () => {
  it("keeps defaults for missing or malformed fields", () => {
    expect(normalizeGteDisplayPreferences({ showBarNumbers: false })).toEqual({
      ...DEFAULT_GTE_DISPLAY_PREFERENCES,
      showBarNumbers: false,
    });
  });

  it("round-trips display-only preferences through storage", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    };
    const preferences = {
      showBarNumbers: false,
      showTimeRuler: true,
      showPlaybackCounter: false,
    };

    writeGteDisplayPreferences(storage, preferences);

    expect(values.has(GTE_DISPLAY_PREFERENCES_STORAGE_KEY)).toBe(true);
    expect(readGteDisplayPreferences(storage)).toEqual(preferences);
  });

  it("does not interrupt editing when browser storage rejects writes", () => {
    const storage = {
      setItem: () => {
        throw new Error("Storage unavailable");
      },
    };

    expect(() =>
      writeGteDisplayPreferences(storage, DEFAULT_GTE_DISPLAY_PREFERENCES)
    ).not.toThrow();
  });
});
