import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { trackCheckoutCancellation } from "../lib/checkoutTracking";
import { ANALYTICS_EVENTS, sendEvent } from "../lib/analytics";

const REASONS = [
  ["price", "The price"],
  ["not_ready", "Not ready yet"],
  ["payment_problem", "Payment problem"],
  ["coupon_problem", "Coupon didn't work"],
  ["unsure_plan", "Unsure which plan"],
  ["other", "Something else"],
] as const;

type CancellationContext = NonNullable<ReturnType<typeof trackCheckoutCancellation>>;

export default function CheckoutCancellationTracker() {
  const router = useRouter();
  const [context, setContext] = useState<CancellationContext | null>(null);

  useEffect(() => {
    if (!router.isReady || router.query.upgrade !== "cancel") return;
    const rawFunnelId = router.query.funnel_id;
    const funnelId = Array.isArray(rawFunnelId) ? rawFunnelId[0] : rawFunnelId;
    const tracked = trackCheckoutCancellation(typeof funnelId === "string" ? funnelId : undefined);
    if (tracked) setContext(tracked);
  }, [router.isReady, router.query.funnel_id, router.query.upgrade]);

  if (!context) return null;

  const sharedProperties = {
    checkout_session_id: context.attempt?.checkoutSessionId,
    checkout_attempt_id: context.attempt?.checkoutAttemptId,
    funnel_id: context.funnelId,
    plan: context.attempt?.plan,
  };

  return (
    <aside
      aria-label="Checkout feedback"
      className="fixed bottom-5 right-5 z-[80] w-[min(22rem,calc(100vw-2rem))] rounded-2xl border border-black/10 bg-white p-4 shadow-[0_18px_50px_rgba(15,23,42,0.16)]"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-slate-950">What stopped you today?</p>
          <p className="mt-1 text-xs leading-5 text-slate-500">Optional—one click helps us improve checkout.</p>
        </div>
        <button
          type="button"
          aria-label="Dismiss checkout feedback"
          onClick={() => {
            sendEvent(ANALYTICS_EVENTS.checkoutAbandonmentReasonDismissed, sharedProperties);
            setContext(null);
          }}
          className="-mr-1 -mt-1 rounded-full px-2 py-1 text-lg leading-none text-slate-400 hover:bg-slate-100 hover:text-slate-700"
        >
          ×
        </button>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {REASONS.map(([reason, label]) => (
          <button
            key={reason}
            type="button"
            onClick={() => {
              sendEvent(ANALYTICS_EVENTS.checkoutAbandonmentReasonSubmitted, {
                ...sharedProperties,
                abandonment_reason: reason,
                $insert_id: `checkout-reason:${context.dedupeId}`,
              });
              setContext(null);
            }}
            className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-2"
          >
            {label}
          </button>
        ))}
      </div>
    </aside>
  );
}
