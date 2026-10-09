export const STANDALONE_PROMOTION_METADATA_KEY = "note2tabsStandalonePromotion";
export const SCHOOL_ACCESS_METADATA_KEY = "note2tabsCardFreeSchoolAccess";
export const SCHOOL_ACCESS_MONTHS_METADATA_KEY = "note2tabsSchoolAccessMonths";

export type StandalonePromotionInput = {
  code: string;
  percentOff: number;
  durationMonths: number;
  expiresAt: number | null;
  maxRedemptions: number | null;
  cardFreeSchoolAccess: boolean;
};

export function parseStandalonePromotionInput(body: unknown): StandalonePromotionInput | null {
  const input = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const code = typeof input.code === "string" ? input.code.trim().toUpperCase() : "";
  const percentOff = Number(input.percentOff);
  const durationMonths = Number(input.durationMonths);
  const hasMaxRedemptions = input.maxRedemptions !== undefined && input.maxRedemptions !== null && input.maxRedemptions !== "";
  const maxRedemptions = hasMaxRedemptions ? Number(input.maxRedemptions) : null;
  const cardFreeSchoolAccess = input.cardFreeSchoolAccess === true;

  if (!/^[A-Z0-9-]{3,32}$/.test(code)) return null;
  if (!Number.isInteger(percentOff) || percentOff < 1 || percentOff > 100) return null;
  if (!Number.isInteger(durationMonths) || durationMonths < 1 || durationMonths > 24) return null;
  if (maxRedemptions !== null && (!Number.isInteger(maxRedemptions) || maxRedemptions < 1 || maxRedemptions > 1_000_000)) return null;
  if (cardFreeSchoolAccess && percentOff !== 100) return null;

  let expiresAt: number | null = null;
  if (input.expiresOn !== undefined && input.expiresOn !== null && input.expiresOn !== "") {
    if (typeof input.expiresOn !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(input.expiresOn)) return null;
    const [year, month, day] = input.expiresOn.split("-").map(Number);
    const milliseconds = Date.UTC(year, month - 1, day, 23, 59, 59);
    const parsed = new Date(milliseconds);
    if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) return null;
    expiresAt = Math.floor(milliseconds / 1000);
    if (expiresAt <= Math.floor(Date.now() / 1000)) return null;
  }

  return { code, percentOff, durationMonths, expiresAt, maxRedemptions, cardFreeSchoolAccess };
}
