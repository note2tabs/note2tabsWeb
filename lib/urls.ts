type HeadersLike = Record<string, string | string[] | undefined>;

const normalizeHeader = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

export const APP_HOME_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

export const getAppBaseUrl = (req?: { headers?: HeadersLike }) => {
  if (typeof window !== "undefined") {
    return window.location.origin;
  }
  const host = normalizeHeader(req?.headers?.host);
  const protoHeader = normalizeHeader(req?.headers?.["x-forwarded-proto"]);
  const proto = protoHeader ? protoHeader.split(",")[0] : "http";
  if (host) return `${proto}://${host}`;
  return APP_HOME_URL;
};
