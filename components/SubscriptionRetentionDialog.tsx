import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  getSubscriptionValueReminder,
  SUBSCRIPTION_RETENTION_GOALS,
  type SubscriptionRetentionGoal,
} from "../lib/subscriptionCancellationRetention";

type Props = {
  open: boolean;
  busy: boolean;
  onClose: () => void;
  onCancellationIntent: () => void;
  onOpenPortal: (intent: "billing" | "cancellation", goal?: SubscriptionRetentionGoal) => void;
  onAlternative: (goal: SubscriptionRetentionGoal, destination: string) => void;
};

export default function SubscriptionRetentionDialog({
  open,
  busy,
  onClose,
  onCancellationIntent,
  onOpenPortal,
  onAlternative,
}: Props) {
  const [step, setStep] = useState<"intent" | "retention">("intent");
  const [goal, setGoal] = useState<SubscriptionRetentionGoal | "">("");
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const valueReminder = getSubscriptionValueReminder(goal);

  useEffect(() => {
    if (!open) return;
    setStep("intent");
    setGoal("");
    closeButtonRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [busy, onClose, open]);

  if (!open) return null;

  return (
    <div className="subscription-retention-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !busy) onClose();
    }}>
      <section
        className="subscription-retention-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="subscription-retention-title"
        aria-describedby="subscription-retention-description"
      >
        <button
          ref={closeButtonRef}
          type="button"
          className="subscription-retention-close"
          aria-label="Close subscription management"
          onClick={onClose}
          disabled={busy}
        >
          ×
        </button>

        {step === "intent" ? (
          <>
            <h2 id="subscription-retention-title">Manage Premium</h2>
            <p id="subscription-retention-description" className="muted">
              What would you like to do? Billing details open directly in Stripe.
            </p>
            <div className="subscription-retention-choices">
              <button type="button" className="subscription-retention-choice" onClick={() => onOpenPortal("billing")} disabled={busy}>
                <strong>Payment and billing details</strong>
                <span>Update your card, view invoices, or manage billing information.</span>
              </button>
              <button type="button" className="subscription-retention-choice" onClick={() => {
                onCancellationIntent();
                setStep("retention");
              }} disabled={busy}>
                <strong>I am thinking about ending Premium</strong>
                <span>Review your options before continuing to Stripe.</span>
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 id="subscription-retention-title">Before you cancel</h2>
            <p id="subscription-retention-description" className="muted">
              What did you originally want Note2Tabs to help you do? Let’s make sure there is nothing valuable left unfinished.
            </p>
            <label className="form-group">
              <span className="label">I signed up to…</span>
              <select className="form-input" value={goal} onChange={(event) => setGoal(event.target.value as SubscriptionRetentionGoal)}>
                <option value="">Choose what brought you here</option>
                {SUBSCRIPTION_RETENTION_GOALS.map((item) => (
                  <option key={item.value} value={item.value}>{item.label}</option>
                ))}
              </select>
            </label>

            {valueReminder && goal && (
              <div className="subscription-retention-save">
                <strong>{valueReminder.title}</strong>
                <p>{valueReminder.detail}</p>
                <Link href={valueReminder.href} className="settingsButton settingsButtonPrimary" onClick={() => onAlternative(goal, valueReminder.href)}>
                  {valueReminder.action}
                </Link>
              </div>
            )}

            <div className="subscription-retention-actions">
              <button type="button" className="button-secondary button-small" onClick={onClose} disabled={busy}>
                Keep Premium
              </button>
              <button
                type="button"
                className="button-ghost button-small"
                onClick={() => goal && onOpenPortal("cancellation", goal)}
                disabled={!goal || busy}
              >
                {busy ? "Opening Stripe…" : "Continue to cancellation"}
              </button>
            </div>
            <button type="button" className="subscription-retention-back" onClick={() => setStep("intent")} disabled={busy}>
              Back to billing options
            </button>
          </>
        )}
      </section>
    </div>
  );
}
