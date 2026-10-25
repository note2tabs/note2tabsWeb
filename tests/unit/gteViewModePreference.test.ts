import { beforeEach, describe, expect, it } from "vitest";
import { VIEW_MODE_TTL_MS, readViewMode, saveViewMode } from "../../lib/gteViewModePreference";

const store = new Map<string, string>();

beforeEach(() => {
  store.clear();
  (globalThis as { window?: unknown }).window = {
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
    },
  };
});

describe("editor view mode preference", () => {
  it("restores the last view for the same editor after a reload", () => {
    saveViewMode("song-1", "practice", 1_000);
    expect(readViewMode("song-1", 2_000)).toBe("practice");
    expect(readViewMode("song-2", 2_000)).toBeNull();
  });

  it("keeps each view mode, including Tab view / MIDI view", () => {
    for (const mode of ["canvas", "tab", "practice"] as const) {
      saveViewMode("song-1", mode, 0);
      expect(readViewMode("song-1", 1)).toBe(mode);
    }
  });

  it("forgets the view after the session window, and clears the stale entry", () => {
    saveViewMode("song-1", "tab", 0);
    expect(readViewMode("song-1", VIEW_MODE_TTL_MS)).toBe("tab");
    expect(readViewMode("song-1", VIEW_MODE_TTL_MS + 1)).toBeNull();
    expect(store.size).toBe(0);
  });

  it("ignores corrupt or future-dated values", () => {
    store.set("note2tabs:gte:view-mode:song-1", "not json");
    expect(readViewMode("song-1")).toBeNull();
    store.set("note2tabs:gte:view-mode:song-1", JSON.stringify({ mode: "bogus", at: 0 }));
    expect(readViewMode("song-1", 1)).toBeNull();
    store.set("note2tabs:gte:view-mode:song-1", JSON.stringify({ mode: "tab", at: 10_000 }));
    expect(readViewMode("song-1", 1)).toBeNull();
  });
});
