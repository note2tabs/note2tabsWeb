import type { AppLocale } from "./locale";
import { translate } from "./translate";
export function relativeUpdatedAt(value: string | undefined, locale: AppLocale, now = Date.now()) {
 const t = (source: string, values?: Record<string, string | number>) => translate(source, locale, values);
 const timestamp = value ? new Date(value).getTime() : NaN;
 if (!Number.isFinite(timestamp)) return t("Recently edited");
 const minutes = Math.floor(Math.max(0, now - timestamp) / 60000);
 if (minutes < 1) return t("Updated just now");
 const formatter = new Intl.RelativeTimeFormat(locale === "pt-BR" ? "pt-BR" : "en-US");
 if (minutes < 60) return formatter.format(-minutes, "minute");
 const hours = Math.floor(minutes / 60);
 if (hours < 24) return formatter.format(-hours, "hour");
 const days = Math.floor(hours / 24);
 if (days < 7) return formatter.format(-days, "day");
 return t("Updated {date}", {date: new Intl.DateTimeFormat(locale === "pt-BR" ? "pt-BR" : "en-US", {month: "short", day: "numeric"}).format(new Date(timestamp))});
}
