const isEnabled = (value?: string) => value === "true" || value === "1";

export const isRemoteDbDevEnabled =
  process.env.NODE_ENV !== "production" && isEnabled(process.env.USE_REMOTE_DB_IN_DEV);

export const isLocalNoDbServerMode =
  process.env.NODE_ENV !== "production" && !isRemoteDbDevEnabled;

export const isEmailVerificationRequiredServer = process.env.NODE_ENV === "production";
