export type FingerprintResult = {
  fingerprintId: string;
  data: Record<string, unknown>;
};

async function hashString(input: string): Promise<string> {
  if (typeof window !== "undefined" && window.crypto?.subtle) {
    const enc = new TextEncoder().encode(input);
    const buf = await window.crypto.subtle.digest("SHA-256", enc);
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }
  // Fallback simple hash (not cryptographic, but avoids blocking)
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(16);
}

export async function generateFingerprint(): Promise<FingerprintResult> {
  if (typeof window === "undefined") {
    return { fingerprintId: "server", data: {} };
  }

  const nav = window.navigator || ({} as Navigator);
  const screenObj = window.screen || ({} as Screen);
  const data: Record<string, unknown> = {
    userAgent: nav.userAgent || "",
    language: nav.language || "",
    platform: nav.platform || "",
    hardwareConcurrency: (nav as any).hardwareConcurrency || "",
    deviceMemory: (nav as any).deviceMemory || "",
    screen: {
      width: screenObj.width,
      height: screenObj.height,
      colorDepth: screenObj.colorDepth,
    },
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };

  const fingerprintId = await hashString(JSON.stringify(data));
  return { fingerprintId, data };
}
