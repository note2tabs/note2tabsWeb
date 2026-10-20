import { escapeEmailHtml } from "./internshipApplication";
import { renderProductEmail } from "./emailTemplate";

export const AFFILIATE_APPLICATION_LIMITS = { email: 254, profile: 500, audience: 120, message: 2000 } as const;
export type AffiliateApplication = { email: string; profile: string; audience: string; message: string };
export function validateAffiliateApplication(body: unknown, now = Date.now()):
  { ok: true; application: AffiliateApplication } | { ok: false; code: "invalid" | "spam"; message: string } {
  const invalid = (message: string, code: "invalid" | "spam" = "invalid") => ({ok: false as const, code, message});
  if (!body || typeof body !== "object" || Array.isArray(body)) return invalid("Please complete the required fields.");
  const raw = body as Record<string, unknown>;
  const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
  if (text(raw.company)) return invalid("The application could not be submitted.", "spam");
  const startedAt = Number(raw.startedAt);
  if (!Number.isFinite(startedAt) || startedAt <= 0 || startedAt > now || now - startedAt < 2500) return invalid("Please wait a moment and try again.", "spam");
  const application = { email: text(raw.email), profile: text(raw.profile), audience: text(raw.audience), message: text(raw.message) };
  if (!application.email || !application.profile || !application.message) return invalid("Please complete all required fields.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(application.email) || /[\r\n]/.test(application.email)) return invalid("Enter a valid email address.");
  for (const key of Object.keys(AFFILIATE_APPLICATION_LIMITS) as Array<keyof AffiliateApplication>) {
    if (application[key].length > AFFILIATE_APPLICATION_LIMITS[key]) return invalid("One or more answers are too long.");
  }
  try {
    const url = new URL(application.profile);
    if (!["https:", "http:"].includes(url.protocol) || !url.hostname || url.username || url.password) throw new Error("Invalid profile URL");
  } catch { return invalid("Enter a valid website or social profile URL."); }
  return { ok: true, application };
}
export function buildAffiliateApplicationEmail(application: AffiliateApplication) {
  const rows = [["Email address", application.email], ["Website or social profile", application.profile],
    ["Audience size", application.audience || "Not provided"], ["Audience and promotion plans", application.message]];
  return {
    subject: "Affiliate application — Note2Tabs",
    text: ["New affiliate application", ...rows.map(([label, value]) => `${label}:\n${value}`)].join("\n\n"),
    html: renderProductEmail({ title: "New affiliate application", preview: "A creator has applied to the affiliate program.",
      bodyHtml: rows.map(([label, value]) => `<p><strong>${escapeEmailHtml(label)}</strong><br/><span style="white-space:pre-wrap">${escapeEmailHtml(value)}</span></p>`).join("") }),
  };
}
