export const TAB_SHARE_EMAIL_SOURCE = "tab_share_email";

export function isTabShareEmailDestination(value: string | null | undefined) {
  if (!value) return false;
  try {
    const url = new URL(value, "https://note2tabs.invalid");
    return url.origin === "https://note2tabs.invalid"
      && url.pathname === "/shared"
      && url.searchParams.get("source") === TAB_SHARE_EMAIL_SOURCE;
  } catch {
    return false;
  }
}
