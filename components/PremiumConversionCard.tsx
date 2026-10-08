import { useLocale } from "../lib/i18n/react";
import Link from "./LocaleLink";
import { useEffect, useRef, useState } from "react";
import { ANALYTICS_EVENTS, sendEvent, trackCtaClick } from "../lib/analytics";
import {
  getOrCreatePremiumFunnelContext,
  premiumFunnelProperties,
  premiumPricingHref,
  type PremiumFunnelContext,
  type PremiumFunnelSource,
} from "../lib/premiumFunnel";

type PremiumConversionTracking = {
  source: PremiumFunnelSource;
  reason: string;
  surface: string;
  trigger: string;
  placement?: string;
};

type PremiumConversionCardBaseProps = {
  title: string;
  description: string;
  actionLabel: string;
  resetMessage?: string;
  planLabel?: string;
  reassurance?: string;
  tracking?: PremiumConversionTracking;
};

type PremiumConversionCardProps = PremiumConversionCardBaseProps &
  (
    | { href: string; onAction?: never; busy?: never }
    | { href?: never; onAction: () => void; busy?: boolean }
  );

export default function PremiumConversionCard({
  title,
  description,
  actionLabel,
  busy = false,
  onAction,
  href,
  resetMessage,
  planLabel = "Note2Tabs Premium",
  reassurance = "",
  tracking,
}: PremiumConversionCardProps) {
  const { t, locale, href: localePath } = useLocale();
  const cardRef = useRef<HTMLElement | null>(null);
  const viewedRef = useRef(false);
  const [funnel, setFunnel] = useState<PremiumFunnelContext | null>(null);
  const trackingSource = tracking?.source;
  const trackingReason = tracking?.reason;
  const trackingSurface = tracking?.surface;
  const trackingTrigger = tracking?.trigger;
  const trackingPlacement = tracking?.placement || "transcriber_limit";

  useEffect(() => {
    if (!trackingSource || !trackingReason || !trackingSurface || !trackingTrigger) return;
    viewedRef.current = false;
    const context = getOrCreatePremiumFunnelContext({ source: trackingSource, reason: trackingReason });
    setFunnel(context);
    const properties = {
      surface: trackingSurface,
      trigger: trackingTrigger,
      placement: trackingPlacement,
      ...premiumFunnelProperties(context),
    };
    sendEvent(ANALYTICS_EVENTS.premiumPromptEligible, properties);
    sendEvent(ANALYTICS_EVENTS.premiumPromptRendered, properties);
    sendEvent(ANALYTICS_EVENTS.premiumPromptShown, properties);
  }, [trackingPlacement, trackingReason, trackingSource, trackingSurface, trackingTrigger]);

  useEffect(() => {
    const element = cardRef.current;
    if (!trackingSurface || !trackingTrigger || !funnel || !element || viewedRef.current) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting || entry.intersectionRatio < 0.5 || viewedRef.current) return;
      viewedRef.current = true;
      sendEvent(ANALYTICS_EVENTS.premiumPromptViewed, {
        surface: trackingSurface,
        trigger: trackingTrigger,
        placement: trackingPlacement,
        ...premiumFunnelProperties(funnel),
      });
      observer.disconnect();
    }, { threshold: 0.5 });
    observer.observe(element);
    return () => observer.disconnect();
  }, [funnel, trackingPlacement, trackingSurface, trackingTrigger]);

  const trackClick = () => {
    if (!trackingSurface || !trackingTrigger || !funnel) return;
    const properties = {
      surface: trackingSurface,
      trigger: trackingTrigger,
      ...premiumFunnelProperties(funnel),
    };
    sendEvent(ANALYTICS_EVENTS.premiumPromptClicked, properties);
    trackCtaClick(`${trackingSurface}_cta`, properties);
  };
  const resolvedHref = href && funnel ? premiumPricingHref(funnel) : href;

  return (
    <aside ref={cardRef} className="premium-conversion-card" aria-label={t("Premium subscription")}>
      <div className="premium-conversion-card__copy">
        <span>{planLabel}</span>
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
      <div className="premium-conversion-card__action">
        {resolvedHref ? (
          <Link href={resolvedHref} className="button-primary button-small" onClick={trackClick}>
            {actionLabel}
          </Link>
        ) : (
          <button
            type="button"
            className="button-primary button-small"
            onClick={() => {
              trackClick();
              onAction?.();
            }}
            disabled={busy}
          >
            {busy ? t("Opening checkout…") : actionLabel}
          </button>
        )}
        <small>
          {locale === "pt-BR" ? t("Final price and billing details are shown at checkout.") : reassurance || "$5.99 billed today · Cancel anytime"}
          {resetMessage ? ` · ${resetMessage}` : ""}
        </small>
      </div>
    </aside>
  );
}
