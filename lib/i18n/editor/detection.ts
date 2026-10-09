import {deviceLocale} from "../detection";
import {ALL_LOCALES,normalizeLocale,type AppLocale} from "../locale";
import {localizedPilotAvailable} from "../pilot";

/** Editor URLs identify projects; language preferences never change those identifiers. */
export function editorRequestLocale(req: {cookies?: Partial<Record<string,string>>; headers: {"accept-language"?: string; cookie?: string}}): AppLocale {
  const saved=req.cookies?.n2t_locale ?? req.headers.cookie?.split(";").map(part=>part.trim()).find(part=>part.startsWith("n2t_locale="))?.slice(11);
  if (saved && ALL_LOCALES.some(locale=>locale.toLowerCase()===saved.toLowerCase())) {
    const locale=normalizeLocale(saved);
    return localizedPilotAvailable(locale) ? locale : "en";
  }
  return deviceLocale(req.headers["accept-language"] || "",localizedPilotAvailable);
}
