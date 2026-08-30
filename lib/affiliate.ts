import type { NextApiRequest } from "next";

export const AFFILIATE_COOKIE = "n2t_ref";
export const AFFILIATE_CLICK_COOKIE = "n2t_ref_click";
export const DEFAULT_AFFILIATE_TERMS = {
  commissionPercent: 20,
  commissionMonths: 6,
  discountPercent: 10,
  discountMonths: 3,
  cookieDays: 30,
  payoutHoldDays: 30,
} as const;

export function normalizeAffiliateCode(value: unknown) {
  if (typeof value !== "string") return null;
  const code = value.trim().toUpperCase();
  return /^[A-Z0-9][A-Z0-9_-]{2,31}$/.test(code) ? code : null;
}

export function affiliateCodeFromRequest(req: NextApiRequest) {
  return normalizeAffiliateCode(req.cookies?.[AFFILIATE_COOKIE]);
}

export function affiliateClickIdFromRequest(req: NextApiRequest) {
  const value = req.cookies?.[AFFILIATE_CLICK_COOKIE];
  return typeof value === "string" && /^[0-9a-f-]{36}$/i.test(value) ? value : null;
}

export function affiliateCanEarnCommission(input: {
  status: string;
  deactivatedAt?: Date | null;
  referralCreatedAt: Date;
}) {
  if (input.status === "ACTIVE") return true;
  return input.status === "DEACTIVATED" && Boolean(
    input.deactivatedAt && input.referralCreatedAt.getTime() <= input.deactivatedAt.getTime()
  );
}

export function commissionAmount(grossAmount: number, percent: number) {
  if (!Number.isFinite(grossAmount) || grossAmount <= 0) return 0;
  return Math.max(0, Math.round(grossAmount * Math.max(0, Math.min(100, percent)) / 100));
}
