import crypto from "crypto";
import net from "net";

function normalizeIpv4(ip: string) {
  const parts = ip.split(".");
  if (parts.length !== 4) return ip;
  return `${parts[0]}.${parts[1]}.${parts[2]}.0`;
}

function normalizeIpv6(ip: string) {
  const parts = ip.split(":");
  const expanded: string[] = [];
  let skipIndex = parts.indexOf("");
  if (skipIndex === -1 && parts[parts.length - 1] === "") {
    skipIndex = parts.length - 1;
  }

  if (skipIndex >= 0) {
    const left = parts.slice(0, skipIndex).filter(Boolean);
    const right = parts.slice(skipIndex + 1).filter(Boolean);
    const missing = Math.max(0, 8 - (left.length + right.length));
    expanded.push(...left, ...Array.from({ length: missing }, () => "0"), ...right);
  } else {
    expanded.push(...parts);
  }

  while (expanded.length < 8) expanded.push("0");
  const masked = expanded.slice(0, 4).concat(["0", "0", "0", "0"]);
  return masked.join(":");
}

export function normalizeIpAddress(ipValue: string | undefined | null): string | undefined {
  if (!ipValue) return undefined;
  const first = ipValue.split(",")[0]?.trim();
  if (!first) return undefined;
  const withoutZone = first.split("%")[0];
  const withoutPort = withoutZone.includes(":") && withoutZone.includes(".")
    ? withoutZone
    : withoutZone.replace(/:\d+$/, "");
  const kind = net.isIP(withoutPort);
  if (kind === 4) return normalizeIpv4(withoutPort);
  if (kind === 6) return normalizeIpv6(withoutPort);
  return undefined;
}

export function hashIpAddress(ipValue: string | undefined | null): string | undefined {
  const normalized = normalizeIpAddress(ipValue);
  if (!normalized) return undefined;
  return crypto.createHash("sha256").update(normalized).digest("hex");
}
