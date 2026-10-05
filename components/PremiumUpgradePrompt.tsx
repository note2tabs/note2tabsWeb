import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { ANALYTICS_EVENTS, sendEvent, trackCtaClick } from "../lib/analytics";
import {
  PREMIUM_PROMPT_SIGNAL_EVENT,
  hasVisitedPremiumPricing,
  readCreditsForPremiumPrompt,
  readPremiumCompletionSnapshot,
  type PremiumPromptSignal,
} from "../lib/premiumPromptSignals";
import {
  getOrCreatePremiumFunnelContext,
  premiumFunnelProperties,
  premiumPricingHref,
  type PremiumFunnelContext,
} from "../lib/premiumFunnel";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const URGENT_FREQUENCY_MS = 24 * 60 * 60 * 1000;
const LOW_CREDIT_THRESHOLD = 3;

export type PromptReason = "returning_user" | "low_credits" | "no_credits";

export function getInitialPremiumPromptReason(
  pathname: string,
  credits: number | null,
  returningUser = false
): PromptReason | null {
  const isTranscriber = pathname === "/transcribe" || pathname === "/transcriber";
  if (!isTranscriber) return null;
  if (credits === 0) return "no_credits";
  if (credits !== null && credits <= LOW_CREDIT_THRESHOLD) return "low_credits";
  return returningUser ? "returning_user" : null;
}

const EXCLUDED_ROUTES = new Set([
  "/pricing", "/auth/login", "/auth/signup", "/auth/verify-email",
  "/reset-password", "/reset-password/[token]",
]);

const hasPremiumAccess = (role?: string, subscriptionPlan?: string) =>
  (Boolean(subscriptionPlan) && subscriptionPlan !== "FREE") ||
  ["PREMIUM", "PRO", "ADMIN", "MODERATOR", "MOD"].includes(role || "");

const promptCopy: Record<PromptReason, { title: string; body: string }> = {
  returning_user: {
    title: "Get more from your transcriptions.",
    body: "Use the Heavy model, transcribe larger files, and get 100 monthly credits.",
  },
  low_credits: {
    title: "Keep transcribing.",
    body: "Premium includes 100 monthly credits and credit rollover.",
  },
  no_credits: {
    title: "Keep transcribing.",
    body: "Get 100 monthly credits, rollover, and access to the Heavy model.",
  },
};

type PremiumPromptCardProps = {
  reason: PromptReason;
  href: string;
  onDismiss: () => void;
  onClick?: () => void;
  preview?: boolean;
};

export function PremiumPromptCard({
  reason,
  href,
  onDismiss,
  onClick,
  preview = false,
}: PremiumPromptCardProps) {
  const copy = promptCopy[reason];
  return (
    <aside className={`premium-upgrade-prompt${preview ? " premium-upgrade-prompt--preview" : ""}`} aria-label="Premium subscription">
      <button type="button" className="premium-upgrade-prompt__close" onClick={onDismiss} aria-label="Dismiss Premium offer">
        <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="m5.5 5.5 9 9m0-9-9 9" /></svg>
      </button>
      <span className="premium-upgrade-prompt__eyebrow">Note2Tabs Premium</span>
      <strong>{copy.title}</strong>
      <p>{copy.body}</p>
      <div className="premium-upgrade-prompt__actions">
        <Link href={href} onClick={onClick}>See plans</Link>
        <button type="button" onClick={onDismiss}>Not now</button>
      </div>
      <small>Plans from $5.99/month · Cancel anytime</small>
    </aside>
  );
}

function readTimestamp(key: string) {
  try { return Number(window.localStorage.getItem(key) || 0); } catch { return 0; }
}

function storageKey(kind: "shown" | "dismissed", reason: PromptReason) {
  return `note2tabs:premium-prompt:${kind}:${reason}`;
}

function isLaterCalendarDay(timestamp: number) {
  const previous = new Date(timestamp);
  const now = new Date();
  return previous.getFullYear() !== now.getFullYear() ||
    previous.getMonth() !== now.getMonth() || previous.getDate() !== now.getDate();
}

export default function PremiumUpgradePrompt() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [reason, setReason] = useState<PromptReason | null>(null);
  const [funnelContext, setFunnelContext] = useState<PremiumFunnelContext | null>(null);
  const promptRef = useRef<HTMLDivElement | null>(null);
  const viewedRef = useRef(false);
  const role = session?.user?.role;
  const isEligible = status === "authenticated" &&
    !hasPremiumAccess(role, session?.user?.subscriptionPlan) &&
    !EXCLUDED_ROUTES.has(router.pathname) && !router.pathname.startsWith("/gte");

  useEffect(() => {
    setReason(null);
    setFunnelContext(null);
    viewedRef.current = false;
    if (!isEligible) return;

    let timeout: number | null = null;
    let activityCleanup: (() => void) | null = null;
    const schedule = (nextReason: PromptReason, delay: number) => {
      const now = Date.now();
      const frequency = nextReason === "returning_user" ? SEVEN_DAYS_MS : URGENT_FREQUENCY_MS;
      if (now - readTimestamp(storageKey("shown", nextReason)) < frequency) return;
      if (now - readTimestamp(storageKey("dismissed", nextReason)) < frequency) return;
      const completion = readPremiumCompletionSnapshot();
      sendEvent(ANALYTICS_EVENTS.premiumPromptEligible, {
        reason: nextReason, trigger: nextReason, placement: "nonmodal_corner",
        surface: "contextual_prompt", remaining_credits: readCreditsForPremiumPrompt(),
        completed_transcription_count: completion?.count || 0,
        previously_visited_pricing: hasVisitedPremiumPricing(),
      });
      if (nextReason === "returning_user") {
        const deferForActivity = () => {
          if (timeout !== null) window.clearTimeout(timeout);
          timeout = null;
          sendEvent(ANALYTICS_EVENTS.premiumPromptDeferred, {
            reason: nextReason,
            trigger: "user_started_task",
            placement: "nonmodal_corner",
            surface: "contextual_prompt",
          });
          activityCleanup?.();
          activityCleanup = null;
        };
        window.addEventListener("pointerdown", deferForActivity, { once: true });
        window.addEventListener("keydown", deferForActivity, { once: true });
        activityCleanup = () => {
          window.removeEventListener("pointerdown", deferForActivity);
          window.removeEventListener("keydown", deferForActivity);
        };
      }
      timeout = window.setTimeout(() => {
        activityCleanup?.();
        activityCleanup = null;
        try { window.localStorage.setItem(storageKey("shown", nextReason), String(Date.now())); } catch {}
        const nextFunnel = getOrCreatePremiumFunnelContext({ source: "premium_prompt", reason: nextReason });
        setFunnelContext(nextFunnel);
        setReason(nextReason);
        const properties = {
          trigger: nextReason, placement: "nonmodal_corner", surface: "contextual_prompt",
          ...premiumFunnelProperties(nextFunnel),
        };
        sendEvent(ANALYTICS_EVENTS.premiumPromptRendered, properties);
        sendEvent(ANALYTICS_EVENTS.premiumPromptShown, properties);
      }, delay);
    };

    const completion = readPremiumCompletionSnapshot();
    const returningUser = Boolean(completion && isLaterCalendarDay(completion.recordedAt) && !hasVisitedPremiumPricing());
    const initialReason = getInitialPremiumPromptReason(router.pathname, readCreditsForPremiumPrompt(), returningUser);
    if (initialReason) schedule(initialReason, initialReason === "returning_user" ? 1800 : 700);

    const onSignal = (event: Event) => {
      const signal = (event as CustomEvent<PremiumPromptSignal>).detail;
      if (!signal) return;
      if (signal.type === "transcription_completed") {
        sendEvent(ANALYTICS_EVENTS.premiumPromptDeferred, {
          reason: "transcription_completed", trigger: "awaiting_post_value_interaction",
          surface: "contextual_prompt",
        });
      } else if (router.pathname === "/transcribe" || router.pathname === "/transcriber") {
        if (signal.remaining === 0) schedule("no_credits", 700);
        else if (signal.remaining <= LOW_CREDIT_THRESHOLD) schedule("low_credits", 900);
      }
    };
    window.addEventListener(PREMIUM_PROMPT_SIGNAL_EVENT, onSignal);
    return () => {
      if (timeout !== null) window.clearTimeout(timeout);
      activityCleanup?.();
      window.removeEventListener(PREMIUM_PROMPT_SIGNAL_EVENT, onSignal);
    };
  }, [isEligible, router.asPath, router.pathname]);

  useEffect(() => {
    const element = promptRef.current;
    if (!element || !reason || !funnelContext || viewedRef.current) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting || entry.intersectionRatio < 0.5 || viewedRef.current) return;
      viewedRef.current = true;
      sendEvent(ANALYTICS_EVENTS.premiumPromptViewed, {
        trigger: reason, placement: "nonmodal_corner", surface: "contextual_prompt",
        ...premiumFunnelProperties(funnelContext),
      });
      observer.disconnect();
    }, { threshold: 0.5 });
    observer.observe(element);
    return () => observer.disconnect();
  }, [funnelContext, reason]);

  if (!reason) return null;
  const dismiss = () => {
    try { window.localStorage.setItem(storageKey("dismissed", reason), String(Date.now())); } catch {}
    setReason(null);
    sendEvent(ANALYTICS_EVENTS.premiumPromptDismissed, {
      reason, trigger: reason, placement: "nonmodal_corner", surface: "contextual_prompt",
      ...(funnelContext ? premiumFunnelProperties(funnelContext) : {}),
    });
  };

  return (
    <div ref={promptRef}>
      <PremiumPromptCard
        reason={reason}
        href={premiumPricingHref(funnelContext || { source: "premium_prompt", reason })}
        onDismiss={dismiss}
        onClick={() => {
          sendEvent(ANALYTICS_EVENTS.premiumPromptClicked, {
            trigger: reason, placement: "nonmodal_corner", surface: "contextual_prompt",
            ...(funnelContext ? premiumFunnelProperties(funnelContext) : {}),
          });
          trackCtaClick("premium_prompt_view_plans", {
            surface: "contextual_prompt", ...(funnelContext ? premiumFunnelProperties(funnelContext) : {}),
          });
        }}
      />
    </div>
  );
}
