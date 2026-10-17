// USD is also the worldwide fallback, so currency cannot identify this audience.
export const PRICE_TAX_NOTE_COOKIE = "n2t_tax_note";
export function showPriceTaxNoteForCountry(country?: string | null) {
  return ["US", "CA"].includes(country?.trim().toUpperCase() || "");
}
export function readPriceTaxNoteCookie(cookie: string) {
  return cookie.split(";").some(part => part.trim() === `${PRICE_TAX_NOTE_COOKIE}=1`);
}
