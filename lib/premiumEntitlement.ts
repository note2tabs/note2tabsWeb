type SessionLike = {
  user?: {
    role?: string | null;
  } | null;
} | null;

const PREMIUM_ROLES = new Set(["PREMIUM", "ADMIN", "MODERATOR", "MOD"]);
const CHECKOUT_RECOVERY_KEY = "note2tabs:premium-checkout-session";

export const hasPremiumEntitlement = (session: SessionLike) =>
  PREMIUM_ROLES.has(session?.user?.role || "");

type WaitForPremiumEntitlementOptions = {
  attempts?: number;
  intervalMs?: number;
  shouldStop?: () => boolean;
  wait?: (milliseconds: number) => Promise<void>;
};

type CheckoutConfirmationFetch = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Pick<Response, "ok">>;

export const confirmPremiumCheckout = async (
  checkoutSessionId: string,
  request: CheckoutConfirmationFetch = fetch
) => {
  const sessionId = checkoutSessionId.trim();
  if (!sessionId || sessionId.length > 255) return false;
  try {
    const response = await request("/api/stripe/confirm-checkout-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId }),
    });
    return response.ok;
  } catch {
    return false;
  }
};

export const checkoutSessionSafePath = (href: string) => {
  try {
    const url = new URL(href, "https://www.note2tabs.com");
    url.searchParams.delete("session_id");
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return href;
  }
};

export const hideCheckoutSessionIdFromAddressBar = () => {
  if (typeof window === "undefined" || !window.location.search.includes("session_id=")) return;
  try {
    const sessionId = new URL(window.location.href).searchParams.get("session_id");
    if (sessionId) window.sessionStorage.setItem(CHECKOUT_RECOVERY_KEY, sessionId);
  } catch {
    // URL cleanup still proceeds if private storage is unavailable.
  }
  window.history.replaceState(
    window.history.state,
    "",
    checkoutSessionSafePath(window.location.href)
  );
};

export const getRecoverableCheckoutSessionId = () => {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage.getItem(CHECKOUT_RECOVERY_KEY);
  } catch {
    return null;
  }
};

export const clearRecoverableCheckoutSessionId = () => {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(CHECKOUT_RECOVERY_KEY);
  } catch {
    // Checkout state expiry is best effort and must not interrupt the funnel.
  }
};

/**
 * Stripe can redirect back before its webhook has updated the local account.
 * Refresh the server-backed NextAuth session for a short, bounded period so a
 * successful checkout can continue without making the customer reload.
 */
export const waitForPremiumEntitlement = async (
  refreshSession: () => Promise<SessionLike>,
  options: WaitForPremiumEntitlementOptions = {}
) => {
  const attempts = Math.max(1, options.attempts ?? 20);
  const intervalMs = Math.max(0, options.intervalMs ?? 750);
  const wait = options.wait ?? ((milliseconds: number) =>
    new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds)));

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (options.shouldStop?.()) return false;
    try {
      if (hasPremiumEntitlement(await refreshSession())) return true;
    } catch {
      // A transient session request should not abandon a completed checkout.
    }
    if (attempt < attempts - 1) await wait(intervalMs);
  }

  return false;
};
