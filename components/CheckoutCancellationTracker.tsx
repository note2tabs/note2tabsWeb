import { useLocale } from "../lib/i18n/react";
import { useEffect, useRef, useState } from "react";
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

export default function CheckoutCancellationTracker({ preview = false, previewMessages, previewRtl = false }: { preview?: boolean; previewMessages?: Record<string, string>; previewRtl?: boolean }) {
  const router = useRouter();
  const {t: translate, href} = useLocale();
  const t = (source: string) => previewMessages?.[source] || translate(source);
  const dialog = useRef<HTMLDialogElement>(null);
  const [feedback, setFeedback] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [context, setContext] = useState<CancellationContext | null>(preview ? {attempt: {plan: "PRO", billingInterval: "yearly", startedAt: 0}, dedupeId: "preview" , funnelId: undefined} : null);

  useEffect(() => {
    if (preview || !router.isReady || router.query.upgrade !== "cancel") return;
    const rawFunnelId = router.query.funnel_id;
    const funnelId = Array.isArray(rawFunnelId) ? rawFunnelId[0] : rawFunnelId;
    const tracked = trackCheckoutCancellation(typeof funnelId === "string" ? funnelId : undefined);
    if (tracked) setContext(tracked);
  }, [router.isReady, router.query.funnel_id, router.query.upgrade, preview]);

  useEffect(() => {
    if (context && !dialog.current?.open) dialog.current?.showModal();
  }, [context]);

  if (!context) return null;

  const sharedProperties = {
    checkout_session_id: context.attempt?.checkoutSessionId,
    checkout_attempt_id: context.attempt?.checkoutAttemptId,
    funnel_id: context.funnelId,
    plan: context.attempt?.plan,
  };

  const dismiss = () => {
    if (!preview && !submitted) sendEvent(ANALYTICS_EVENTS.checkoutAbandonmentReasonDismissed, sharedProperties);
    setContext(null);
  };
  const resume = new URLSearchParams({
    checkout: "1",
    plan: context.attempt?.plan?.toLowerCase() === "pro" ? "pro" : "premium",
    billing: context.attempt?.billingInterval === "yearly" ? "yearly" : "monthly",
  });
  if (context.funnelId) resume.set("funnel_id", context.funnelId);
  if (context.attempt?.source) resume.set("source", context.attempt.source);
  if (context.attempt?.reason) resume.set("reason", context.attempt.reason);

  return (
    <dialog dir={preview ? (previewRtl ? "rtl" : "ltr") : undefined} ref={dialog} className="checkout-return" aria-labelledby="checkout-return-title" onCancel={dismiss}>
      <button className="return-close" type="button" aria-label={t("Dismiss checkout feedback")} onClick={dismiss}>×</button>
      <div className="return-layout">
        <a className="return-brand" href={href("/")}><img src="/favicon-32x32.png" width="24" height="24" alt="" />Note2Tabs</a>
        <div className="return-content">
          <h1 id="checkout-return-title">{t("Payment not completed")}</h1>
          <p className="return-description">{t("Your upgrade isn't complete. Continue to checkout whenever you're ready.")}</p>
          <div className="return-actions">
            <a className="return-primary" href={href(`/pricing?${resume}`)}>{t("Retry payment")}<span aria-hidden="true">↗</span></a>
            <a className="return-secondary" href={href("/transcribe")}>{t("Back to transcribing")}</a>
          </div>
          <div className="return-feedback">
            {submitted ? <p role="status">{t("Thanks for your feedback.")}</p> : <>
              <button type="button" className="return-feedback-toggle" aria-expanded={feedback} onClick={() => setFeedback(!feedback)}>{t("What stopped you today?")} <span aria-hidden="true">{feedback ? "−" : "+"}</span></button>
              {feedback && <div className="return-reasons">
                <p>{t("Optional—one click helps us improve checkout.")}</p>
                {REASONS.map(([reason, label]) => <button key={reason} type="button" onClick={() => {
                  if (!preview) sendEvent(ANALYTICS_EVENTS.checkoutAbandonmentReasonSubmitted, {
                    ...sharedProperties, abandonment_reason: reason,
                    $insert_id: `checkout-reason:${context.dedupeId}`,
                  });
                  setSubmitted(true);
                }}>{t(label)}</button>)}
              </div>}
            </>}
          </div>
        </div>
      </div>
      <style jsx>{`
        .checkout-return { position: fixed; inset: 0; width: 100vw; max-width: none; height: 100dvh; max-height: none; margin: 0; padding: 0; border: 0; color: #192522; background: #f8faf8; overflow-y: auto; }
        .checkout-return::backdrop { background: #f8faf8; }
        .return-layout { min-height: 100%; display: flex; flex-direction: column; padding: 40px 7vw 28px; background: radial-gradient(ellipse at 75% 35%, #e9f0eb80, transparent 60%); }
        .return-brand { color: inherit; text-decoration: none; width: fit-content; display: flex; align-items: center; gap: 9px; font-size: 17px; font-weight: 650; letter-spacing: -.5px; }
        .return-close { position: absolute; inset-inline-end: 32px; top: 30px; width: 44px; height: 44px; border: 1px solid #dce3dd; border-radius: 50%; background: #ffffff80; font-size: 26px; color: #53645b; cursor: pointer; }
        .return-content { width: 100%; max-width: 490px; margin: auto; padding: 72px 0; }
        h1 { font-size: clamp(32px, 4vw, 43px); line-height: 1.12; letter-spacing: -.045em; font-weight: 550; margin: 0; text-wrap: balance; }
        .return-description { color: #647269; font-size: 16px; line-height: 1.75; margin: 20px 0 30px; max-width: 410px; }
        .return-actions { display: flex; flex-direction: column; gap: 12px; }
        .return-actions a { display: flex; justify-content: center; align-items: center; min-height: 52px; padding: 12px 20px; border-radius: 12px; text-decoration: none; font-size: 15px; font-weight: 550; transition: background .15s; }
        .return-primary { color: white; background: #234c38; box-shadow: 0 2px 3px #183c2520, inset 0 1px 0 #ffffff20; gap: 14px; }
        .return-primary:hover { background: #193f2d; }
        .return-secondary { color: #475b4d; background: #ffffff70; border: 1px solid #dce4de; }
        .return-secondary:hover { background: #eaf0eb; }
        .return-feedback { margin-top: 30px; border-top: 1px solid #dfe6e0; padding-top: 20px; color: #6b786f; font-size: 13px; }
        .return-feedback-toggle { width: 100%; display: flex; justify-content: space-between; gap: 16px; border: 0; background: none; padding: 4px 0; color: inherit; cursor: pointer; text-align: start; }
        .return-reasons { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
        .return-reasons p { width: 100%; margin: 0 0 8px; line-height: 1.6; }
        .return-reasons button { border: 1px solid #d5dfd7; background: #fff; border-radius: 20px; padding: 9px 12px; color: #475b4d; cursor: pointer; }
        .return-reasons button:hover { background: #e9f1eb; }
        button:focus-visible, a:focus-visible { outline: 2px solid #32664c; outline-offset: 4px; }
        @media (max-width: 600px) { .return-layout { padding: 26px 24px 22px; } .return-close { top: 17px; inset-inline-end: 18px; } .return-content { padding: 60px 0 40px; } }
      `}</style>
    </dialog>
  );
}
