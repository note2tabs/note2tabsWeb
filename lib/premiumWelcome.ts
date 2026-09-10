const ALLOWED_DESTINATIONS = new Set(["/", "/home", "/transcribe", "/gte"]);

export const premiumWelcomeDestination = (value: unknown) => {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (typeof candidate !== "string" || !candidate.startsWith("/")) {
    return "/transcribe";
  }

  try {
    const url = new URL(candidate, "https://www.note2tabs.com");
    if (url.origin !== "https://www.note2tabs.com") return "/transcribe";
    if (!ALLOWED_DESTINATIONS.has(url.pathname) && !url.pathname.startsWith("/gte/")) {
      return "/transcribe";
    }
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/transcribe";
  }
};

export const isResumingTranscription = (destination: string) =>
  destination.includes("resumeTranscription=1");

export const premiumWelcomePreviewAllowed = (
  vercelEnvironment = process.env.VERCEL_ENV,
  nodeEnvironment = process.env.NODE_ENV
) => vercelEnvironment === "preview" || nodeEnvironment === "development";
