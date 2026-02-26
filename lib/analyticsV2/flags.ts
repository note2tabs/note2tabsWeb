const toBool = (value: string | undefined, defaultValue: boolean) => {
  if (value === undefined) return defaultValue;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return defaultValue;
};

const toInt = (value: string | undefined, defaultValue: number) => {
  if (!value) return defaultValue;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return defaultValue;
  return parsed;
};

const isProd = process.env.NODE_ENV === "production";

export const analyticsFlags = {
  dualWrite: toBool(process.env.ANALYTICS_V2_DUAL_WRITE, true),
  readsEnabled: toBool(process.env.ANALYTICS_V2_READS_ENABLED, false),
  adminParityEnabled: toBool(process.env.ANALYTICS_ADMIN_PARITY_ENABLED, true),
  parityThresholdPct: toInt(process.env.ANALYTICS_PARITY_THRESHOLD_PCT, 5),
  fingerprintLinkDays: toInt(process.env.ANALYTICS_FINGERPRINT_LINK_DAYS, 30),
  rawRetentionDays: toInt(process.env.ANALYTICS_RAW_RETENTION_DAYS, 180),
  rollupRetentionDays: toInt(process.env.ANALYTICS_ROLLUP_RETENTION_DAYS, 730),
  propsMaxBytes: toInt(process.env.ANALYTICS_PROPS_MAX_BYTES, 16 * 1024),
};

export function assertFingerprintSalt() {
  const salt = process.env.ANALYTICS_FINGERPRINT_SALT || (isProd ? "" : "dev-analytics-salt");
  if (!salt) {
    throw new Error("ANALYTICS_FINGERPRINT_SALT must be set in production.");
  }
  return salt;
}
