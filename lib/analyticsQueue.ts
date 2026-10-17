export function newAnalyticsEventId() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = new Uint8Array(16); crypto.getRandomValues(bytes);
  return Array.from(bytes).map(byte => byte.toString(16).padStart(2,"0")).join("");
}

type Mode = "fetch" | "beacon";
const queues = new Set<{ flush(mode?: Mode): Promise<void>; clear(): void }>();
export function clearAnalyticsQueues() { queues.forEach(q => q.clear()); }
export async function flushAnalyticsQueues() { await Promise.all([...queues].map(q => q.flush())); }

/** Acknowledged delivery, stable replay and bounded per-tab crash recovery. */
export function createAnalyticsQueue<T>({ key, batchSize, delay, allowed, id, timestamp, send }: {
  key: string; batchSize: number; delay: number; allowed(): boolean;
  id(event: T): string; timestamp(event: T): string;
  send(events: T[], mode: Mode): Promise<boolean>;
}) {
  let pending: T[] = [];
  let restored = false;
  let generation = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const inFlight = new Map<string, T>();
  const unconfirmed = new Map<string, T>();
  const persist = () => {
    try {
      const events = allowed() ? [...inFlight.values(), ...unconfirmed.values(), ...pending] : [];
      if (events.length) window.sessionStorage.setItem(key, JSON.stringify(events));
      else window.sessionStorage.removeItem(key);
    } catch { /* Privacy/storage restrictions leave the memory queue available. */ }
  };
  const restore = () => {
    if (restored) return;
    restored = true;
    try {
      const saved: T[] = JSON.parse(window.sessionStorage.getItem(key) || "[]");
      if (Array.isArray(saved)) {
        const valid = saved.filter(e => e && typeof id(e) === "string" && Number.isFinite(Date.parse(timestamp(e))) && Date.now() - Date.parse(timestamp(e)) < 86_400_000);
        pending = [...new Map(valid.map(e => [id(e), e])).values()].slice(-batchSize * 10);
      }
    } catch { /* Corrupt recovery data must not interrupt the product. */ }
  };
  const schedule = () => {
    if (!timer && (pending.length || unconfirmed.size)) timer = setTimeout(() => { timer = undefined; void flush(); }, delay);
  };
  const clear = () => {
    generation++;
    pending = []; unconfirmed.clear(); inFlight.clear(); restored = true;
    if (timer) clearTimeout(timer);
    timer = undefined;
    // An already running request cannot be recalled; its completion must not
    // restore cleared data, including after the user subsequently opts in.
    try { window.sessionStorage.removeItem(key); } catch { /* unavailable */ }
  };
  const flush = async (mode: Mode = "fetch") => {
    if (timer) clearTimeout(timer);
    timer = undefined;
    restore();
    if (!allowed()) { clear(); return; }
    pending = [...unconfirmed.values(), ...pending]; unconfirmed.clear();
    do {
      if (!pending.length) return;
      const events: T[] = [];
      let bytes = 16; // JSON envelope overhead; stay below the keepalive budget.
      while (pending.length && events.length < batchSize) {
        const size = new TextEncoder().encode(JSON.stringify(pending[0])).byteLength + 1;
        if (events.length && bytes + size > 48_000) break;
        bytes += size; events.push(pending.shift()!);
      }
      const startedGeneration = generation;
      events.forEach(e => inFlight.set(id(e), e)); persist();
      let failed = false;
      try {
        const confirmed = await send(events, mode);
        if (!confirmed && generation === startedGeneration && allowed()) events.forEach(e => unconfirmed.set(id(e), e));
      } catch {
        failed = true;
        if (generation === startedGeneration && allowed()) pending = [...events, ...pending].slice(0, batchSize * 10);
      } finally {
        events.forEach(e => inFlight.delete(id(e))); persist();
      }
      if (failed) { schedule(); return; }
    } while (mode === "beacon" && pending.length);
    schedule();
  };
  const enqueue = async (event: T) => {
    restore();
    if (!allowed()) { clear(); return; }
    if (inFlight.has(id(event)) || unconfirmed.has(id(event)) || pending.some(e => id(e) === id(event))) return;
    pending.push(event); persist();
    if (pending.length >= batchSize) await flush();
    else schedule();
  };
  const queue = { enqueue, flush, clear };
  queues.add(queue);
  return queue;
}
