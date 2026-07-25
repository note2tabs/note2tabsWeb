import type { EditorListItem } from "../types/gte";

const EDITOR_LIST_CACHE_PREFIX = "note2tabs:gte:editor-list:";
export const EDITOR_LIST_CACHE_FRESH_MS = 15_000;

type EditorListCache = {
  cachedAt: number;
  editors: EditorListItem[];
};

const cacheKey = (userId: string) => `${EDITOR_LIST_CACHE_PREFIX}${userId}`;

export function readEditorListCache(
  storage: Pick<Storage, "getItem">,
  userId: string,
  now: number = Date.now()
) {
  try {
    const raw = storage.getItem(cacheKey(userId));
    const parsed = raw ? (JSON.parse(raw) as EditorListCache | EditorListItem[]) : null;
    const editors = Array.isArray(parsed) ? parsed : parsed?.editors;
    const cachedAt =
      parsed && !Array.isArray(parsed) && Number.isFinite(parsed.cachedAt)
        ? parsed.cachedAt
        : 0;
    if (!Array.isArray(editors)) {
      return { editors: null, isFresh: false };
    }
    return {
      editors,
      isFresh: cachedAt > 0 && now - cachedAt < EDITOR_LIST_CACHE_FRESH_MS,
    };
  } catch {
    return { editors: null, isFresh: false };
  }
}

export function writeEditorListCache(
  storage: Pick<Storage, "setItem">,
  userId: string,
  editors: EditorListItem[],
  cachedAt: number = Date.now()
) {
  try {
    storage.setItem(
      cacheKey(userId),
      JSON.stringify({ cachedAt, editors } satisfies EditorListCache)
    );
  } catch {
    // The cache is only a speed optimization.
  }
}

export function invalidateEditorListCache(
  storage: Pick<Storage, "removeItem">,
  userId: string
) {
  try {
    storage.removeItem(cacheKey(userId));
  } catch {
    // The cache is only a speed optimization.
  }
}
