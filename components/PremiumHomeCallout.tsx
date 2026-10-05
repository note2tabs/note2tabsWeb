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
    <aside className="premium-home-callout" aria-label="Note2Tabs Premium">
      <div>
        <strong>More room for full songs and the Heavy model.</strong>
        <p>Get 100 monthly credits, rollover, and full-length audio-file transcription.</p>
      </div>
      <Link href={href} onClick={onClick}>See plans</Link>
    </aside>
  );
}

export default function PremiumHomeCallout() {
  const { data: session, status } = useSession();
  const [funnel, setFunnel] = useState<PremiumFunnelContext | null>(null);
  const [visible, setVisible] = useState(false);
  const shownRef = useRef(false);
  const viewedRef = useRef(false);
  const calloutRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (
      status !== "authenticated" ||
      hasPremiumAccess(session?.user?.role, session?.user?.subscriptionPlan)
    ) {
      shownRef.current = false;
      setVisible(false);
      return;
    }
    if (shownRef.current) return;
    const context = getOrCreatePremiumFunnelContext({
      source: "signed_home",
      reason: "signed_home_value",
    });
    shownRef.current = true;
    setFunnel(context);
    setVisible(true);
    sendEvent(ANALYTICS_EVENTS.premiumPromptEligible, {
      surface: "signed_home_inline",
      placement: "below_transcription_form",
      trigger: "passive_awareness",
      ...premiumFunnelProperties(context),
    });
    sendEvent(ANALYTICS_EVENTS.premiumPromptRendered, {
      surface: "signed_home_inline",
      placement: "below_transcription_form",
      trigger: "passive_awareness",
      ...premiumFunnelProperties(context),
    });
    sendEvent(ANALYTICS_EVENTS.premiumPromptShown, {
      surface: "signed_home_inline",
      ...premiumFunnelProperties(context),
    });
  }, [session?.user?.role, session?.user?.subscriptionPlan, status]);

  useEffect(() => {
    const element = calloutRef.current;
    if (!visible || !funnel || !element || viewedRef.current) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting || entry.intersectionRatio < 0.5 || viewedRef.current) return;
      viewedRef.current = true;
      sendEvent(ANALYTICS_EVENTS.premiumPromptViewed, {
        surface: "signed_home_inline",
        placement: "below_transcription_form",
        trigger: "passive_awareness",
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
              surface: "signed_home_callout",
              ...premiumFunnelProperties(funnel),
            });
            trackCtaClick("signed_home_explore_premium", {
              surface: "signed_home_callout",
              ...premiumFunnelProperties(funnel),
            });
          }}
        />
      </div>
    </div>
  );
}
