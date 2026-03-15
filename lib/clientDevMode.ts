const isEnabled = (value?: string) => value === "true" || value === "1";

export const isDevelopmentClient = process.env.NODE_ENV !== "production";

export const isRemoteDbDevEnabledClient =
  isDevelopmentClient &&
  isEnabled(process.env.NEXT_PUBLIC_USE_REMOTE_DB_IN_DEV);

export const isLocalNoDbClientMode =
  isDevelopmentClient && !isRemoteDbDevEnabledClient;
