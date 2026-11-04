import type { GetServerSidePropsContext } from "next";

/** Only call for public, request-independent loaders. Country selects initial prices. */
export function cacheLocalizedPublicPage(context: GetServerSidePropsContext) {
  const {req,res} = context;
  if (context.preview || context.draftMode || req.headers.authorization || res.getHeader("Set-Cookie")) return;
  // Without trusted geolocation, initial currency may come from a visitor cookie.
  if (typeof req.headers["x-vercel-ip-country"] !== "string") return;
  const existing = String(res.getHeader("Cache-Control") ?? "");
  if (/private|no-store|no-cache/i.test(existing)) return;
  const vary = String(res.getHeader("Vary") ?? "").split(",").map(value=>value.trim()).filter(Boolean);
  if (vary.some(value=>value === "*" || value.toLowerCase() === "cookie")) return;
  if (!vary.some(value=>value.toLowerCase() === "x-vercel-ip-country")) vary.push("X-Vercel-IP-Country");
  res.setHeader("Vary", vary.join(", "));
  res.setHeader("Cache-Control", "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400");
}
