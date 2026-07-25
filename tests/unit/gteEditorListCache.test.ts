import { describe, expect, it, vi } from "vitest";
import {
  EDITOR_LIST_CACHE_FRESH_MS,
  invalidateEditorListCache,
  readEditorListCache,
  writeEditorListCache,
} from "../../lib/gteEditorListCache";

const editor = {
  id: "editor-1",
  name: "Song",
  noteCount: 4,
  chordCount: 1,
};

describe("editor list cache", () => {
  it("skips a repeat request while the cached list is fresh", () => {
    let value: string | null = null;
    const storage = {
      getItem: vi.fn(() => value),
      setItem: vi.fn((_key: string, next: string) => {
        value = next;
      }),
    };

    writeEditorListCache(storage, "user-1", [editor], 1_000);

    expect(readEditorListCache(storage, "user-1", 1_000 + EDITOR_LIST_CACHE_FRESH_MS - 1)).toEqual({
      editors: [editor],
      isFresh: true,
    });
    expect(readEditorListCache(storage, "user-1", 1_000 + EDITOR_LIST_CACHE_FRESH_MS)).toEqual({
      editors: [editor],
      isFresh: false,
    });
  });

  it("reads the previous array-only cache as stale so it can refresh safely", () => {
    const storage = {
      getItem: vi.fn(() => JSON.stringify([editor])),
    };

    expect(readEditorListCache(storage, "user-1", 2_000)).toEqual({
      editors: [editor],
      isFresh: false,
    });
  });

  it("invalidates the cache after creating an editor", () => {
    const removeItem = vi.fn();
    invalidateEditorListCache({ removeItem }, "user-1");
    expect(removeItem).toHaveBeenCalledWith("note2tabs:gte:editor-list:user-1");
  });
});
