import crypto from "crypto";
import { assertFingerprintSalt } from "./flags";

export function hashFingerprint(rawFingerprint: string | undefined | null): string | undefined {
  if (!rawFingerprint || typeof rawFingerprint !== "string") return undefined;
  const trimmed = rawFingerprint.trim();
  if (!trimmed) return undefined;
  const salt = assertFingerprintSalt();
  return crypto.createHash("sha256").update(`${salt}${trimmed}`).digest("hex");
}

export function extractRawFingerprint(input: unknown): string | undefined {
  if (!input || typeof input !== "object") return undefined;
  const record = input as Record<string, unknown>;
  const direct = record.fingerprintId;
  if (typeof direct === "string" && direct.trim()) return direct.trim();
  const alt = record.fingerprint_id;
  if (typeof alt === "string" && alt.trim()) return alt.trim();
  const props = record.props;
  if (props && typeof props === "object") {
    const maybe = (props as Record<string, unknown>).fingerprintId;
    if (typeof maybe === "string" && maybe.trim()) return maybe.trim();
  }
  return undefined;
}
