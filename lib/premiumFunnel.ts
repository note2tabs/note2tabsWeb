export const PREMIUM_FUNNEL_SOURCES = [
  "unknown",
  "pricing_page",
  "home_pricing",
  "large_upload_gate",
  "settings",
  "premium_prompt",
  "navigation",
  "heavy_model",
  "low_credits",
  "signed_home",
] as const;

export type PremiumFunnelSource = (typeof PREMIUM_FUNNEL_SOURCES)[number];

export type PremiumFunnelContext = {
  funnelId: string;
  source: PremiumFunnelSource;
  reason: string;
  createdAt: number;
};

type FunnelContextInput = {
  source?: unknown;
  reason?: unknown;
  funnelId?: unknown;
};

const STORAGE_KEY = "note2tabs:premium-funnel-context";
const CONTEXT_MAX_AGE_MS = 30 * 60 * 1000;
const FUNNEL_ID_PATTERN = /^[a-zA-Z0-9_-]{8,80}$/;
const CATEGORY_PATTERN = /[^a-z0-9_-]+/g;

const getSessionStorage = () => {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
};

const randomId = () => {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
  }
};

export function normalizePremiumFunnelSource(value: unknown): PremiumFunnelSource {
  return typeof value === "string" &&
    (PREMIUM_FUNNEL_SOURCES as readonly string[]).includes(value)
    ? (value as PremiumFunnelSource)
    : "unknown";
}

export function normalizePremiumFunnelReason(value: unknown, fallback = "plan_comparison") {
  if (typeof value !== "string") return fallback;
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(CATEGORY_PATTERN, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);
  return normalized || fallback;
}

export function normalizePremiumFunnelId(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return FUNNEL_ID_PATTERN.test(trimmed) ? trimmed : null;
}

export function readPremiumFunnelContext(): PremiumFunnelContext | null {
  const storage = getSessionStorage();
  if (!storage) return null;
  try {
    const parsed = JSON.parse(storage.getItem(STORAGE_KEY) || "null") as Partial<PremiumFunnelContext> | null;
    const funnelId = normalizePremiumFunnelId(parsed?.funnelId);
    const createdAt = Number(parsed?.createdAt || 0);
    if (!funnelId || !Number.isFinite(createdAt) || Date.now() - createdAt > CONTEXT_MAX_AGE_MS) {
      storage.removeItem(STORAGE_KEY);
      return null;
    }
    return {
      funnelId,
      source: normalizePremiumFunnelSource(parsed?.source),
      reason: normalizePremiumFunnelReason(parsed?.reason),
      createdAt,
    };
  } catch {
    return null;
  }
}

export function getOrCreatePremiumFunnelContext(input: FunnelContextInput): PremiumFunnelContext {
  const source = normalizePremiumFunnelSource(input.source);
  const reason = normalizePremiumFunnelReason(input.reason);
  const providedId = normalizePremiumFunnelId(input.funnelId);
  const existing = readPremiumFunnelContext();
  const canReuse = Boolean(
    existing &&
      existing.source === source &&
      existing.reason === reason &&
      (!providedId || existing.funnelId === providedId)
  );
  if (canReuse && existing) return existing;

  const context: PremiumFunnelContext = {
    funnelId: providedId || randomId(),
    source,
    reason,
    createdAt: Date.now(),
  };
  try {
    getSessionStorage()?.setItem(STORAGE_KEY, JSON.stringify(context));
  } catch {
    // Funnel measurement must never block the checkout path.
  }
  return context;
}

export function premiumFunnelProperties(context: PremiumFunnelContext) {
  return {
    funnel_id: context.funnelId,
    source: context.source,
    reason: context.reason,
  };
}

export function premiumPricingHref(input: FunnelContextInput) {
  const source = normalizePremiumFunnelSource(input.source);
  const reason = normalizePremiumFunnelReason(input.reason);
  const funnelId = normalizePremiumFunnelId(input.funnelId);
  const query = new URLSearchParams({ source, reason });
  if (funnelId) query.set("funnel_id", funnelId);
  return `/pricing?${query.toString()}`;
}
