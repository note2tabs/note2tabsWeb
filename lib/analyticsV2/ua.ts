export type ParsedUserAgent = {
  browser: string;
  os: string;
  deviceType: string;
  userAgent: string;
};

export function parseUserAgent(ua: string | undefined): ParsedUserAgent {
  const userAgent = ua || "";
  const lower = userAgent.toLowerCase();

  let deviceType = "desktop";
  if (lower.includes("mobile")) deviceType = "mobile";
  if (lower.includes("tablet") || lower.includes("ipad")) deviceType = "tablet";

  let browser = "unknown";
  if (lower.includes("edg")) browser = "edge";
  else if (lower.includes("chrome")) browser = "chrome";
  else if (lower.includes("firefox")) browser = "firefox";
  else if (lower.includes("safari")) browser = "safari";

  let os = "unknown";
  if (lower.includes("windows")) os = "windows";
  else if (lower.includes("mac os") || lower.includes("macintosh")) os = "macos";
  else if (lower.includes("android")) os = "android";
  else if (lower.includes("iphone") || lower.includes("ipad") || lower.includes("ios")) os = "ios";
  else if (lower.includes("linux")) os = "linux";

  return { browser, os, deviceType, userAgent };
}
