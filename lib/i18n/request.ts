import type { NextApiRequest } from "next";
import { normalizeLocale, type AppLocale } from "./locale";
import { localizedPilotAvailable } from "./pilot";
/** A browser preference, never authentication or billing authority. */
export function requestLocale(req: Pick<NextApiRequest, "body" | "cookies">): AppLocale {
  const locale = normalizeLocale(req.body?.locale ?? req.cookies?.n2t_locale);
  return !localizedPilotAvailable(locale) ? "en" : locale;
}
