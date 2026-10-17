import { prisma } from "../prisma";
import { validLocale } from "./preference";
import type { AppLocale } from "./locale";

/** Account preference wins over the language of a caller requesting an email. */
export async function accountEmailLocale(accountId: string, fallback: AppLocale = "en"): Promise<AppLocale> {
  const rows = await prisma.$queryRaw<Array<{ locale: string }>>`SELECT locale FROM "AccountLanguage" WHERE "accountId" = ${accountId}`;
  return validLocale(rows[0]?.locale) || fallback;
}
export async function saveAccountLanguage(accountId: string, locale: AppLocale, onlyIfMissing = false) {
  if (!validLocale(locale)) throw new Error("Unsupported account language");
  if (onlyIfMissing) {
    return prisma.$executeRaw`INSERT INTO "AccountLanguage" ("accountId", locale) VALUES (${accountId}, ${locale}) ON CONFLICT ("accountId") DO NOTHING`;
  } else {
    return prisma.$executeRaw`INSERT INTO "AccountLanguage" ("accountId", locale) VALUES (${accountId}, ${locale})
      ON CONFLICT ("accountId") DO UPDATE SET locale = EXCLUDED.locale, "updatedAt" = NOW() WHERE "AccountLanguage".locale IS DISTINCT FROM EXCLUDED.locale`;
  }
}
