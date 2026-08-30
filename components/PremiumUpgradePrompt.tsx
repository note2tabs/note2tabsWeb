import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { ANALYTICS_EVENTS, sendEvent, trackCtaClick } from "../lib/analytics";
import {
  PREMIUM_PROMPT_SIGNAL_EVENT,
  readCreditsForPremiumPrompt,
  type PremiumPromptSignal,
} from "../lib/premiumPromptSignals";
import {
  getOrCreatePremiumFunnelContext,
  premiumFunnelProperties,
  premiumPricingHref,
  type PremiumFunnelContext,
} from "../lib/premiumFunnel";

const DISMISSED_AT_KEY = "note2tabs:premium-prompt-dismissed-at";
const LAST_CONTEXTUAL_SHOWN_AT_KEY = "note2tabs:premium-prompt-contextual-last-shown-at";
const LAST_TRANSCRIBER_SHOWN_AT_KEY = "note2tabs:premium-prompt-transcriber-last-shown-at";
const DISMISS_FOR_MS = 14 * 24 * 60 * 60 * 1000;
const PASSIVE_FREQUENCY_MS = 7 * 24 * 60 * 60 * 1000;
const COMPLETION_FREQUENCY_MS = 3 * 24 * 60 * 60 * 1000;
const URGENT_FREQUENCY_MS = 24 * 60 * 60 * 1000;
const TRANSCRIBER_SHOW_AFTER_MS = 12_000;
const LOW_CREDIT_THRESHOLD = 3;

type PromptReason =
  | "transcriber_passive"
  | "transcription_completed"
  | "low_credits"
  | "no_credits";

export function getInitialPremiumPromptReason(
  pathname: string,
  credits: number | null
): PromptReason | null {
  if (credits === 0) return "no_credits";
  if (credits !== null && credits <= LOW_CREDIT_THRESHOLD) return "low_credits";
  return pathname === "/transcribe" || pathname === "/transcriber"
    ? "transcriber_passive"
    : null;
}

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

const getFrequencyForReason = (reason: PromptReason) => {
  if (reason === "transcriber_passive") return PASSIVE_FREQUENCY_MS;
  if (reason === "no_credits" || reason === "low_credits") return URGENT_FREQUENCY_MS;
  return COMPLETION_FREQUENCY_MS;
};

const promptCopy: Record<PromptReason, { title: string; body: string }> = {
  transcriber_passive: {
    title: "More room for full songs and the Heavy model.",
    body: "Get 100 monthly credits, rollover, and full-length audio-file transcription.",
  },
  transcription_completed: {
    title: "Your transcription is ready.",
    body: "Premium gives you more room to keep creating and use Heavy more often.",
  },
  low_credits: {
    title: "You’re running low on credits.",
    body: "Keep your momentum with 10× more monthly credits and credit rollover.",
  },
  no_credits: {
    title: "Keep transcribing with Premium.",
    body: "Get 100 monthly credits, rollover, and full-song audio uploads.",
  },
};

function readTimestamp(key: string) {
  try {
    return Number(window.localStorage.getItem(key) || 0);
  } catch {
    return 0;
  }
}

export default function PremiumUpgradePrompt() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [reason, setReason] = useState<PromptReason | null>(null);
  const [funnelContext, setFunnelContext] = useState<PremiumFunnelContext | null>(null);
  const role = session?.user?.role;
  const isEligible =
    status === "authenticated" &&
    !hasPremiumAccess(role) &&
    !EXCLUDED_ROUTES.has(router.pathname) &&
    !router.pathname.startsWith("/gte");

  useEffect(() => {
    setReason(null);
    setFunnelContext(null);
    if (!isEligible) return;

    let timeout: number | null = null;

    const schedule = (nextReason: PromptReason, delay: number) => {
      const now = Date.now();
      const lastShownKey =
        nextReason === "transcriber_passive"
          ? LAST_TRANSCRIBER_SHOWN_AT_KEY
          : LAST_CONTEXTUAL_SHOWN_AT_KEY;
      if (now - readTimestamp(DISMISSED_AT_KEY) < DISMISS_FOR_MS) return;
      if (
        now - readTimestamp(lastShownKey) < getFrequencyForReason(nextReason)
      ) return;
      if (timeout !== null) window.clearTimeout(timeout);
      timeout = window.setTimeout(() => {
        try {
          window.localStorage.setItem(lastShownKey, String(Date.now()));
        } catch {
          // Frequency limiting is best effort in hardened browser contexts.
        }
        const nextFunnel = getOrCreatePremiumFunnelContext({
          source: "premium_prompt",
          reason: nextReason,
        });
        setFunnelContext(nextFunnel);
        setReason(nextReason);
        sendEvent(ANALYTICS_EVENTS.premiumPromptShown, {
          surface: "contextual_prompt",
          ...premiumFunnelProperties(nextFunnel),
        });
      }, delay);
    };

    const initialReason = getInitialPremiumPromptReason(
      router.pathname,
      readCreditsForPremiumPrompt()
    );
    if (initialReason) {
      const delay =
        initialReason === "no_credits"
          ? 900
          : initialReason === "low_credits"
            ? 1_500
            : TRANSCRIBER_SHOW_AFTER_MS;
      schedule(initialReason, delay);
    }

    const onSignal = (event: Event) => {
      const signal = (event as CustomEvent<PremiumPromptSignal>).detail;
      if (!signal) return;
      if (signal.type === "transcription_completed") {
        schedule("transcription_completed", 1_200);
      } else if (signal.remaining === 0) {
        schedule("no_credits", 900);
      } else if (signal.remaining <= LOW_CREDIT_THRESHOLD) {
        schedule("low_credits", 1_500);
      }
    };

    window.addEventListener(PREMIUM_PROMPT_SIGNAL_EVENT, onSignal);
    return () => {
      if (timeout !== null) window.clearTimeout(timeout);
      window.removeEventListener(PREMIUM_PROMPT_SIGNAL_EVENT, onSignal);
    };
  }, [isEligible, router.asPath]);

  if (!reason) return null;
  const copy = promptCopy[reason];

  const dismiss = () => {
    try {
      window.localStorage.setItem(DISMISSED_AT_KEY, String(Date.now()));
    } catch {
      // The prompt still closes when storage is unavailable.
    }
    setReason(null);
    sendEvent(ANALYTICS_EVENTS.premiumPromptDismissed, {
      reason,
      surface: "contextual_prompt",
      ...(funnelContext ? premiumFunnelProperties(funnelContext) : {}),
    });
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
      <strong>{copy.title}</strong>
      <p>{copy.body}</p>
      <Link
        href={premiumPricingHref(
          funnelContext || { source: "premium_prompt", reason }
        )}
        onClick={() => {
          sendEvent(ANALYTICS_EVENTS.premiumPromptClicked, {
            surface: "contextual_prompt",
            ...(funnelContext ? premiumFunnelProperties(funnelContext) : {}),
          });
          trackCtaClick("premium_prompt_view_plans", {
            surface: "contextual_prompt",
            ...(funnelContext ? premiumFunnelProperties(funnelContext) : {}),
          });
        }}
      >
        Explore Premium
      </Link>
      <small>Eligible new subscribers get a 7-day trial · Cancel anytime</small>
    </aside>
  );
}
