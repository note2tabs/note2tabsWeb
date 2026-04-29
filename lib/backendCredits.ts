import type { CreditsSummary } from "./credits";

const API_BASE = process.env.BACKEND_API_BASE_URL || "http://127.0.0.1:8000";
const BACKEND_SECRET =
  process.env.BACKEND_SHARED_SECRET || process.env.NOTE2TABS_BACKEND_SECRET;

export type BackendCreditRead = {
  available: boolean;
  remainingCredits: number | null;
};

export function buildBackendCreditHeaders(userId: string) {
  const headers: Record<string, string> = {
    "X-User-Id": userId,
  };
  if (BACKEND_SECRET) {
    headers["X-Backend-Secret"] = BACKEND_SECRET;
  }
  return headers;
}

function extractRemainingCredits(payload: unknown) {
  if (!payload || typeof payload !== "object") return null;
  const data = payload as Record<string, unknown>;
  const candidates = [
    data.remainingCredits,
    data.remaining_credits,
    data.credits,
    data.creditsLeft,
    data.credits_left,
  ];
  for (const value of candidates) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return Math.max(0, Math.round(value));
    }
    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return Math.max(0, Math.round(parsed));
    }
  }
  return null;
}

export async function fetchBackendCredits(
  headers: Record<string, string>
): Promise<BackendCreditRead> {
  const response = await fetch(`${API_BASE}/api/v1/credits`, {
    method: "GET",
    headers,
  });
  if (!response.ok) {
    throw new Error(await response.text().catch(() => "Failed to fetch backend credits."));
  }
  const payload = await response.json().catch(() => null);
  const creditsEnabled =
    !payload || typeof payload !== "object"
      ? true
      : (payload as { creditsEnabled?: unknown }).creditsEnabled !== false;
  return {
    available: creditsEnabled,
    remainingCredits: creditsEnabled ? extractRemainingCredits(payload) : null,
  };
}

export async function setBackendCredits(
  userId: string,
  credits: number,
  headers: Record<string, string>
) {
  const response = await fetch(`${API_BASE}/api/v1/credits/set`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify({
      userId,
      credits: Math.max(0, Math.floor(credits)),
    }),
  });
  if (!response.ok) {
    throw new Error(await response.text().catch(() => "Failed to sync backend credits."));
  }
  const payload = await response.json().catch(() => null);
  return extractRemainingCredits(payload) ?? Math.max(0, Math.floor(credits));
}

export async function raiseBackendCreditsToFloor(
  userId: string,
  minimumCredits: number,
  headers: Record<string, string>
) {
  const read = await fetchBackendCredits(headers);
  if (!read.available) return null;
  const floor = Math.max(0, Math.floor(minimumCredits));
  if (typeof read.remainingCredits === "number" && read.remainingCredits >= floor) {
    return read.remainingCredits;
  }
  return setBackendCredits(userId, floor, headers);
}

export function withBackendRemainingCredits(
  credits: CreditsSummary,
  backendRemaining: number | null | undefined
): CreditsSummary {
  if (typeof backendRemaining !== "number" || !Number.isFinite(backendRemaining)) {
    return credits;
  }
  const remaining = Math.max(0, Math.round(backendRemaining));
  return {
    ...credits,
    remaining,
    limit: Math.max(credits.limit, credits.used + remaining),
  };
}
