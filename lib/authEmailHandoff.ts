const KEY = "note2tabs:auth-email-handoff";
/** Short-lived, same-tab recovery only. Never put email/password in navigation URLs. */
export function saveAuthEmail(email: string) {
  try {
    const value = email.trim();
    if (!value || value.length > 254) return;
    sessionStorage.setItem(KEY, JSON.stringify({ email: value, at: Date.now() }));
  } catch { /* Recovery must work without browser storage. */ }
}
export function takeAuthEmail(): string {
  try {
    const raw = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    if (!raw) return "";
    const value = JSON.parse(raw);
    return typeof value.email === "string" && value.email.length <= 254 &&
      typeof value.at === "number" && Date.now() - value.at >= 0 && Date.now() - value.at < 15 * 60_000
      ? value.email : "";
  } catch { return ""; }
}
