const SAFE_EMBED_IDENTIFIER_RE = /^[A-Za-z0-9_-]{1,160}$/;

export const isValidEmbedIdentifier = (value: unknown): value is string =>
  typeof value === "string" && SAFE_EMBED_IDENTIFIER_RE.test(value);
