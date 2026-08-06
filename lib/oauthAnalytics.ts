export type OAuthIntent = {
  intent: "signup" | "login";
  next: string;
  savedAt: number;
};

const STORAGE_KEY = "note2tabs:oauth-intent";
const MAX_AGE_MS = 15 * 60 * 1000;

function getSessionStorage() {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function saveOAuthIntent(intent: OAuthIntent["intent"], next: string) {
  const storage = getSessionStorage();
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify({ intent, next, savedAt: Date.now() }));
  } catch {
    // Analytics state must never block sign-in.
  }
}

export function clearOAuthIntent() {
  const storage = getSessionStorage();
  if (!storage) return;
  try {
    storage.removeItem(STORAGE_KEY);
  } catch {
    // Analytics state must never block sign-in.
  }
}

export function takeOAuthIntent(): OAuthIntent | null {
  const storage = getSessionStorage();
  if (!storage) return null;
  let raw: string | null = null;
  try {
    raw = storage.getItem(STORAGE_KEY);
    storage.removeItem(STORAGE_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as OAuthIntent;
    if (!value || Date.now() - value.savedAt > MAX_AGE_MS) return null;
    if (value.intent !== "signup" && value.intent !== "login") return null;
    return value;
  } catch {
    return null;
  }
}
