import type { NextApiRequest } from "next";

// Conservative high-value launch markets. This can be expanded without a code
// change by configuring a comma-separated HEAVY_PREVIEW_COUNTRIES value.
const DEFAULT_COUNTRIES = [
  "US", "CA", "GB", "AU", "NZ", "IE",
  "DE", "AT", "CH", "NL", "BE", "LU",
  "DK", "SE", "NO", "FI", "IS", "FR",
  "JP", "SG",
];

export function getHeavyPreviewCountries() {
  const configured = process.env.HEAVY_PREVIEW_COUNTRIES;
  return new Set(
    (configured ? configured.split(",") : DEFAULT_COUNTRIES)
      .map((country) => country.trim().toUpperCase())
      .filter(Boolean)
  );
}

export function getRequestCountry(req: Pick<NextApiRequest, "headers">) {
  const raw = req.headers["x-vercel-ip-country"];
  const country = Array.isArray(raw) ? raw[0] : raw;
  if (country) return country.trim().toUpperCase();
  return process.env.NODE_ENV !== "production"
    ? (process.env.HEAVY_PREVIEW_TEST_COUNTRY || "US").trim().toUpperCase()
    : null;
}

export function isHeavyPreviewCountry(req: Pick<NextApiRequest, "headers">) {
  const country = getRequestCountry(req);
  return Boolean(country && getHeavyPreviewCountries().has(country));
}
