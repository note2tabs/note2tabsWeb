export type GteDisplayPreferences = {
  showBarNumbers: boolean;
  showTimeRuler: boolean;
  showPlaybackCounter: boolean;
};

export const GTE_DISPLAY_PREFERENCES_STORAGE_KEY = "note2tabs.gte.display.v1";

export const DEFAULT_GTE_DISPLAY_PREFERENCES: GteDisplayPreferences = {
  showBarNumbers: true,
  showTimeRuler: true,
  showPlaybackCounter: true,
};

const readBoolean = (value: unknown, fallback: boolean) =>
  typeof value === "boolean" ? value : fallback;

export const normalizeGteDisplayPreferences = (
  value: unknown
): GteDisplayPreferences => {
  const source = value && typeof value === "object"
    ? (value as Partial<GteDisplayPreferences>)
    : {};
  return {
    showBarNumbers: readBoolean(
      source.showBarNumbers,
      DEFAULT_GTE_DISPLAY_PREFERENCES.showBarNumbers
    ),
    showTimeRuler: readBoolean(
      source.showTimeRuler,
      DEFAULT_GTE_DISPLAY_PREFERENCES.showTimeRuler
    ),
    showPlaybackCounter: readBoolean(
      source.showPlaybackCounter,
      DEFAULT_GTE_DISPLAY_PREFERENCES.showPlaybackCounter
    ),
  };
};

export const readGteDisplayPreferences = (
  storage: Pick<Storage, "getItem">
): GteDisplayPreferences => {
  try {
    const raw = storage.getItem(GTE_DISPLAY_PREFERENCES_STORAGE_KEY);
    return raw
      ? normalizeGteDisplayPreferences(JSON.parse(raw))
      : DEFAULT_GTE_DISPLAY_PREFERENCES;
  } catch {
    return DEFAULT_GTE_DISPLAY_PREFERENCES;
  }
};

export const writeGteDisplayPreferences = (
  storage: Pick<Storage, "setItem">,
  preferences: GteDisplayPreferences
) => {
  try {
    storage.setItem(
      GTE_DISPLAY_PREFERENCES_STORAGE_KEY,
      JSON.stringify(normalizeGteDisplayPreferences(preferences))
    );
  } catch {
    // Display preferences must never make the editor unusable when browser
    // storage is disabled or full.
  }
};
