import { newAnalyticsEventId } from "./analyticsQueue";
// Business keys are explicit. Ordinary clicks/views must never be globally
// deduplicated: a later click or visit is a real new occurrence.
const KEY = "n2t:analytics-business-events:v1";
const MAX_AGE = 30 * 86_400_000;
const LIMIT = 500;
type Entry = { key: string; id: string; ts: string };
const memory: Entry[] = [];
export function businessEventIdentity(name: string, props: Record<string, unknown>) {
  const key = typeof props.$insert_id === "string" ? `${name}:${props.$insert_id}` : undefined;
  if (!key) return {};
  let entries = memory;
  try { entries = [...memory, ...JSON.parse(window.localStorage.getItem(KEY) || "[]")]; } catch { /* memory fallback */ }
  if (!Array.isArray(entries)) entries = [];
  entries = entries.filter(e => e && typeof e.key === "string" && typeof e.id === "string" && Number.isFinite(Date.parse(e.ts)) && Date.now() - Date.parse(e.ts) < MAX_AGE);
  const existing = entries.find(e => e.key === key);
  if (existing) return { event_id: existing.id, ts: existing.ts };
  const entry = { key, id: newAnalyticsEventId(), ts: new Date().toISOString() };
  entries.push(entry);
  memory.splice(0, memory.length, ...entries.slice(-LIMIT));
  try { window.localStorage.setItem(KEY, JSON.stringify(memory)); } catch { /* memory fallback */ }
  return { event_id: entry.id, ts: entry.ts };
}

export function clearBusinessEventIdentities() {
  memory.length = 0;
  try { window.localStorage.removeItem(KEY); } catch { /* unavailable storage */ }
}
