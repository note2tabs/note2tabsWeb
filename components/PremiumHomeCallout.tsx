import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { ANALYTICS_EVENTS, sendEvent, trackCtaClick } from "../lib/analytics";
import {
  getOrCreatePremiumFunnelContext,
  premiumFunnelProperties,
  premiumPricingHref,
  type PremiumFunnelContext,
} from "../lib/premiumFunnel";

const hasPremiumAccess = (role?: string, subscriptionPlan?: string) =>
  (Boolean(subscriptionPlan) && subscriptionPlan !== "FREE") ||
  ["PREMIUM", "PRO", "ADMIN", "MODERATOR", "MOD"].includes(role || "");

type PremiumHomeCalloutCardProps = {
  href: string;
  onClick?: () => void;
};

export function PremiumHomeCalloutCard({ href, onClick }: PremiumHomeCalloutCardProps) {
  return (
    <aside className="premium-home-callout" aria-label="Longer YouTube transcription options">
      <div>
        <strong>Need a longer section?</strong>
        <p>Free accounts can transcribe 30 seconds at a time. Premium unlocks longer YouTube sections within the first 10 minutes.</p>
      </div>
      <Link href={href} onClick={onClick}>See longer options</Link>
    </aside>
  );
}

export default function PremiumHomeCallout({ show = false }: { show?: boolean }) {
  const { data: session, status } = useSession();
  const [funnel, setFunnel] = useState<PremiumFunnelContext | null>(null);
  const [visible, setVisible] = useState(false);
  const shownRef = useRef(false);
  const viewedRef = useRef(false);
  const calloutRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (
      !show ||
      status === "loading" ||
      hasPremiumAccess(session?.user?.role, session?.user?.subscriptionPlan)
    ) {
      shownRef.current = false;
      setVisible(false);
      return;
    }
    if (shownRef.current) return;
    const context = getOrCreatePremiumFunnelContext({
      source: "premium_prompt",
      reason: "youtube_clip_limit",
    });
    shownRef.current = true;
    setFunnel(context);
    setVisible(true);
    sendEvent(ANALYTICS_EVENTS.premiumPromptEligible, {
      surface: "youtube_clip_limit_inline",
      placement: "below_youtube_time_range",
      trigger: "youtube_link_added",
      ...premiumFunnelProperties(context),
    });
    sendEvent(ANALYTICS_EVENTS.premiumPromptRendered, {
      surface: "youtube_clip_limit_inline",
      placement: "below_youtube_time_range",
      trigger: "youtube_link_added",
      ...premiumFunnelProperties(context),
    });
    sendEvent(ANALYTICS_EVENTS.premiumPromptShown, {
      surface: "youtube_clip_limit_inline",
      ...premiumFunnelProperties(context),
    });
  }, [session?.user?.role, session?.user?.subscriptionPlan, show, status]);

  useEffect(() => {
    const element = calloutRef.current;
    if (!visible || !funnel || !element || viewedRef.current) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting || entry.intersectionRatio < 0.5 || viewedRef.current) return;
      viewedRef.current = true;
      sendEvent(ANALYTICS_EVENTS.premiumPromptViewed, {
        surface: "youtube_clip_limit_inline",
        placement: "below_youtube_time_range",
        trigger: "youtube_link_added",
        ...premiumFunnelProperties(funnel),
      });
      observer.disconnect();
    }, { threshold: 0.5 });
    observer.observe(element);
    return () => observer.disconnect();
  }, [funnel, visible]);

  if (!visible || !funnel) return null;

  return (
    <div className="premium-home-callout-wrap">
      <div ref={calloutRef}>
        <PremiumHomeCalloutCard
          href={premiumPricingHref(funnel)}
          onClick={() => {
            sendEvent(ANALYTICS_EVENTS.premiumPromptClicked, {
              surface: "youtube_clip_limit_inline",
              ...premiumFunnelProperties(funnel),
            });
            trackCtaClick("youtube_clip_limit_explore_premium", {
              surface: "youtube_clip_limit_inline",
              ...premiumFunnelProperties(funnel),
            });
          }}
        />
      </div>
    </div>
  );
}
