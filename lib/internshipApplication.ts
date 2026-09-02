export const INTERNSHIP_APPLICATION_LIMITS = {
  email: 254,
  program: 120,
  studyYear: 80,
  presentation: 3000,
  portfolio: 2000,
  linkedIn: 500,
} as const;

export type InternshipApplication = {
  email: string;
  program: string;
  studyYear: string;
  presentation: string;
  portfolio: string;
  linkedIn: string;
};

type RawApplication = Partial<Record<keyof InternshipApplication | "company" | "startedAt", unknown>>;

export type ApplicationValidationResult =
  | { ok: true; application: InternshipApplication }
  | { ok: false; code: "invalid" | "spam"; message: string };

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isHttpUrl(value: string) {
  if (!value) return true;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function validateInternshipApplication(
  body: unknown,
  now = Date.now()
): ApplicationValidationResult {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, code: "invalid", message: "Please complete the required fields." };
  }

  const raw = body as RawApplication;
  if (text(raw.company)) {
    return { ok: false, code: "spam", message: "The application could not be submitted." };
  }

  const startedAt = typeof raw.startedAt === "number" ? raw.startedAt : Number(raw.startedAt);
  if (!Number.isFinite(startedAt) || startedAt > now || now - startedAt < 2500) {
    return { ok: false, code: "spam", message: "Please wait a moment and try again." };
  }

  const application: InternshipApplication = {
    email: text(raw.email),
    program: text(raw.program),
    studyYear: text(raw.studyYear),
    presentation: text(raw.presentation),
    portfolio: text(raw.portfolio),
    linkedIn: text(raw.linkedIn),
  };

  if (!application.email || !application.program || !application.studyYear || !application.presentation) {
    return { ok: false, code: "invalid", message: "Please complete all required fields." };
  }
  if (!EMAIL_PATTERN.test(application.email) || application.email.length > INTERNSHIP_APPLICATION_LIMITS.email) {
    return { ok: false, code: "invalid", message: "Enter a valid email address." };
  }

  const lengthChecks: Array<[keyof InternshipApplication, number]> = [
    ["program", INTERNSHIP_APPLICATION_LIMITS.program],
    ["studyYear", INTERNSHIP_APPLICATION_LIMITS.studyYear],
    ["presentation", INTERNSHIP_APPLICATION_LIMITS.presentation],
    ["portfolio", INTERNSHIP_APPLICATION_LIMITS.portfolio],
    ["linkedIn", INTERNSHIP_APPLICATION_LIMITS.linkedIn],
  ];
  if (lengthChecks.some(([key, limit]) => application[key].length > limit)) {
    return { ok: false, code: "invalid", message: "One or more answers are too long." };
  }
  if (!isHttpUrl(application.linkedIn)) {
    return { ok: false, code: "invalid", message: "Enter a valid LinkedIn URL." };
  }

  return { ok: true, application };
}

export function escapeEmailHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    const replacements: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return replacements[character];
  });
}

export function buildInternshipApplicationEmail(application: InternshipApplication) {
  const rows: Array<[string, string]> = [
    ["Email address", application.email],
    ["Program / major", application.program],
    ["Year of study", application.studyYear],
    ["Short presentation", application.presentation],
    ["Past work / portfolio", application.portfolio || "Not provided"],
    ["LinkedIn profile", application.linkedIn || "Not provided"],
  ];
  const htmlRows = rows
    .map(
      ([label, value]) =>
        `<tr><th style="padding:12px 16px;text-align:left;vertical-align:top;border-bottom:1px solid #e7e2d8">${escapeEmailHtml(
          label
        )}</th><td style="padding:12px 16px;white-space:pre-wrap;border-bottom:1px solid #e7e2d8">${escapeEmailHtml(
          value
        )}</td></tr>`
    )
    .join("");

  return {
    subject: `Internship application — ${application.program.replace(/[\r\n]+/g, " ")}`,
    html: `<div style="font-family:Arial,sans-serif;color:#101312"><h1>New internship application</h1><table style="border-collapse:collapse;width:100%;max-width:720px">${htmlRows}</table></div>`,
    text: ["New internship application", "", ...rows.map(([label, value]) => `${label}:\n${value}`)].join("\n\n"),
  };
}
