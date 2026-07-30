import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { trackCtaClick } from "../lib/analytics";

const DISMISSED_AT_KEY = "note2tabs:premium-prompt-dismissed-at";
const DISMISS_FOR_MS = 14 * 24 * 60 * 60 * 1000;
const SHOW_AFTER_MS = 8_000;
const EXCLUDED_ROUTES = new Set([
  "/pricing",
  "/auth/login",
  "/auth/signup",
  "/auth/verify-email",
  "/reset-password",
  "/reset-password/[token]",
]);

const hasPremiumAccess = (role?: string) =>
  role === "PREMIUM" || role === "ADMIN" || role === "MODERATOR" || role === "MOD";

export default function PremiumUpgradePrompt() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [visible, setVisible] = useState(false);
  const role = session?.user?.role;
  const isEligible =
    status === "authenticated" &&
    !hasPremiumAccess(role) &&
    !EXCLUDED_ROUTES.has(router.pathname) &&
    !router.pathname.startsWith("/gte");

  useEffect(() => {
    setVisible(false);
    if (!isEligible) return;

    const dismissedAt = Number(window.localStorage.getItem(DISMISSED_AT_KEY) || 0);
    if (Date.now() - dismissedAt < DISMISS_FOR_MS) return;

    const timeout = window.setTimeout(() => setVisible(true), SHOW_AFTER_MS);
    return () => window.clearTimeout(timeout);
  }, [isEligible, router.asPath]);

  if (!visible) return null;

  const dismiss = () => {
    window.localStorage.setItem(DISMISSED_AT_KEY, String(Date.now()));
    setVisible(false);
    trackCtaClick("premium_prompt_dismissed", { surface: "floating_prompt" });
  };

  return (
    <aside className="premium-upgrade-prompt" aria-label="Premium subscription">
      <button
        type="button"
        className="premium-upgrade-prompt__close"
        onClick={dismiss}
        aria-label="Dismiss Premium offer"
      >
        <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
          <path d="m5.5 5.5 9 9m0-9-9 9" />
        </svg>
      </button>
      <span className="premium-upgrade-prompt__eyebrow">Note2Tabs Premium</span>
      <strong>Use Heavy more often.</strong>
      <p>Get 5× more monthly credits, faster processing, and full-song uploads.</p>
      <Link
        href="/pricing"
        onClick={() =>
          trackCtaClick("premium_prompt_view_plans", { surface: "floating_prompt" })
        }
      >
        Explore Premium
      </Link>
    </aside>
  );
}
