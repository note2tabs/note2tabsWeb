export function normalizeSafeReturnPath(
  value: unknown,
  fallback = "/home"
): string {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (typeof candidate !== "string") return fallback;
  const trimmed = candidate.trim();
  if (
    !trimmed.startsWith("/") ||
    trimmed.startsWith("//") ||
    trimmed.includes("\\") ||
    /[\u0000-\u001f\u007f]/.test(trimmed)
  ) {
    return fallback;
  }
  try {
    const parsed = new URL(trimmed, "https://note2tabs.invalid");
    return parsed.origin === "https://note2tabs.invalid"
      ? `${parsed.pathname}${parsed.search}${parsed.hash}`
      : fallback;
  } catch {
    return fallback;
  }
}
