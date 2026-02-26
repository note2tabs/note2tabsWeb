import { describe, expect, it } from "vitest";
import { hashFingerprint } from "../../lib/analyticsV2/fingerprintHash";

describe("fingerprint hashing", () => {
  it("hashes deterministically with server salt", () => {
    const a = hashFingerprint("fingerprint-123");
    const b = hashFingerprint("fingerprint-123");
    expect(a).toBeTruthy();
    expect(a).toBe(b);
  });

  it("returns undefined for missing fingerprints", () => {
    expect(hashFingerprint(undefined)).toBeUndefined();
    expect(hashFingerprint("   ")).toBeUndefined();
  });

  it("does not return raw fingerprint", () => {
    const hashed = hashFingerprint("raw-fingerprint-value");
    expect(hashed).not.toBe("raw-fingerprint-value");
  });
});
