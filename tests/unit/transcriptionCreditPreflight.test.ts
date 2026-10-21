import { describe, expect, it, vi } from "vitest";
import { transcriptionCreditPreflight } from "../../lib/transcriptionCreditPreflight";
import type { CreditsSummary } from "../../lib/credits";
const balance = (remaining: number, unlimited = false): CreditsSummary => ({ used: 10 - remaining, limit: 10, remaining, unlimited, resetAt: "2026-11-01T00:00:00Z" });
const response = (credits: unknown) => ({ ok: true, json: async () => ({ credits }) }) as Response;

describe("transcription credit preflight", () => {
  it.each([[null, 4], [balance(4), 4], [balance(0, true), 4], [balance(0), 0]] as const)("does not add a request for an unknown, adequate, unlimited or free-preview balance", async (cached, required) => {
    const request = vi.fn<typeof fetch>();
    expect(await transcriptionCreditPreflight(cached, required, request)).toEqual({ blocked: false, credits: null });
    expect(request).not.toHaveBeenCalled();
  });
  it("blocks before upload only when the server confirms the balance is insufficient", async () => {
    const fresh = balance(1);
    const request = vi.fn<typeof fetch>().mockResolvedValue(response(fresh));
    expect(await transcriptionCreditPreflight(balance(0), 4, request)).toEqual({ blocked: true, credits: fresh });
    expect(request).toHaveBeenCalledWith("/api/credits", expect.objectContaining({ cache: "no-store", signal: expect.any(AbortSignal) }));
  });
  it.each([balance(10), balance(0, true)])("allows reset, newly purchased or unlimited credits despite a stale insufficient cache", async (fresh) => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(response(fresh));
    expect(await transcriptionCreditPreflight(balance(0), 4, request)).toEqual({ blocked: false, credits: fresh });
  });
  it.each([null, { remaining: "0", unlimited: false }, { remaining: NaN, unlimited: false }, { remaining: 0 }])("leaves the authoritative submission path available for malformed credit responses", async (credits) => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(response(credits));
    expect(await transcriptionCreditPreflight(balance(0), 4, request)).toEqual({ blocked: false, credits: null });
  });
  it("leaves the server submission path available if the credit endpoint is unavailable", async () => {
    for (const request of [vi.fn<typeof fetch>().mockRejectedValue(new Error("offline")), vi.fn<typeof fetch>().mockResolvedValue({ ok: false } as Response)]) {
      expect(await transcriptionCreditPreflight(balance(0), 4, request)).toEqual({ blocked: false, credits: null });
    }
  });
  it("bounds a stalled credit refresh", async () => {
    vi.useFakeTimers();
    try {
      const request = vi.fn<typeof fetch>().mockImplementation((_url, options) => new Promise((_resolve, reject) => options!.signal!.addEventListener("abort", () => reject(new Error("aborted")))));
      const result = transcriptionCreditPreflight(balance(0), 4, request);
      await vi.advanceTimersByTimeAsync(4000);
      expect(await result).toEqual({ blocked: false, credits: null });
    } finally { vi.useRealTimers(); }
  });
});
