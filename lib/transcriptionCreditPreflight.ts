import type { CreditsSummary } from "./credits";

/** Refresh a known insufficient balance before spending time uploading audio.
 * Never reject from a stale cache: the transcription API remains authoritative.
 * Healthy/unknown balances and free previews do not add another request.
 */
export async function transcriptionCreditPreflight(
  cached: CreditsSummary | null,
  required: number,
  request: typeof fetch = fetch,
): Promise<{ blocked: boolean; credits: CreditsSummary | null }> {
  if (!cached || cached.unlimited || required <= 0 || cached.remaining >= required) {
    return { blocked: false, credits: null };
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);
  try {
    const response = await request("/api/credits", { cache: "no-store", signal: controller.signal });
    if (!response.ok) return { blocked: false, credits: null };
    const { credits } = await response.json();
    if (!credits || typeof credits.remaining !== "number" || !Number.isFinite(credits.remaining)
      || typeof credits.unlimited !== "boolean") {
      return { blocked: false, credits: null };
    }
    return { blocked: !credits.unlimited && credits.remaining < required, credits };
  } catch {
    // A failed preflight must not lock somebody out of the existing server path.
    return { blocked: false, credits: null };
  } finally {
    clearTimeout(timeout);
  }
}
