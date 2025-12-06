type HistoryEntry = {
  jobId: string;
  songTitle?: string | null;
  artist?: string | null;
  createdAt: string;
};

const STORAGE_KEY = "note2tabs_history";
const MAX_ENTRIES = 20;

export function saveJobToHistory(entry: HistoryEntry) {
  if (typeof window === "undefined") return;
  try {
    const existing = getJobHistory();
    const filtered = existing.filter((e) => e.jobId !== entry.jobId);
    const next = [entry, ...filtered].slice(0, MAX_ENTRIES);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch (error) {
    // ignore
  }
}

export function getJobHistory(): HistoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed as HistoryEntry[];
    }
    return [];
  } catch (error) {
    return [];
  }
}
