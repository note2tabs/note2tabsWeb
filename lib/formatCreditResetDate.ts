const creditResetDateFormatter = new Intl.DateTimeFormat("en", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

export const formatCreditResetDate = (value?: string | Date | null, locale = "en") => {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "" : (locale !== "en" ? new Intl.DateTimeFormat(locale, {day: "numeric", month: "short", year: "numeric", timeZone: "UTC"}) : creditResetDateFormatter).format(date);
};
