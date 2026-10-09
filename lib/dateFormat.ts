import type { AppLocale } from "./i18n/locale";
export const formatBlogDate = (value?: string | null, locale: AppLocale = "en") => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(locale === "en" ? "en-US" : locale, {
    month: "short", day: "numeric", year: "numeric", timeZone: "UTC",
  }).format(date);
};
