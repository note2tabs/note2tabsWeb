const creditResetDateFormatter = new Intl.DateTimeFormat("en", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

export const formatCreditResetDate = (value?: string | Date | null, locale = "en") => {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "" : (locale === "pt-BR" ? new Intl.DateTimeFormat("pt-BR", {day: "numeric", month: "short", year: "numeric", timeZone: "UTC"}) : creditResetDateFormatter).format(date);
};
