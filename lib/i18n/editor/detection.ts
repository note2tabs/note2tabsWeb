import {cookieValue, validLocale} from "../preference";
import {deviceLocale} from "../detection";
import {type AppLocale} from "../locale";
import {localizedPilotAvailable} from "../pilot";

/** Editor URLs identify projects; language preferences never change those identifiers. */
export function editorRequestLocale(req: {cookies?: Partial<Record<string,string>>; headers: {"accept-language"?: string; cookie?: string}}): AppLocale {
  // Public translated routes remember their language without marking an explicit
  // picker choice. Preserve that language when entering a shared editor URL.
  const saved=validLocale(req.cookies?.n2t_locale ?? cookieValue(req.headers.cookie || "", "n2t_locale"));
  if (saved) return localizedPilotAvailable(saved) ? saved : "en";
  return deviceLocale(req.headers["accept-language"] || "",localizedPilotAvailable);
}
