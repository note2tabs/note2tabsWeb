import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  getSubscriptionSaveOption,
  SUBSCRIPTION_CANCELLATION_REASONS,
  type SubscriptionCancellationReason,
} from "../lib/subscriptionCancellationRetention";

type Props = {
  open: boolean;
  busy: boolean;
  onClose: () => void;
  onCancellationIntent: () => void;
  onOpenPortal: (intent: "billing" | "cancellation", reason?: SubscriptionCancellationReason) => void;
  onAlternative: (reason: SubscriptionCancellationReason, destination: string) => void;
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
  const [reason, setReason] = useState<SubscriptionCancellationReason | "">("");
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const saveOption = getSubscriptionSaveOption(reason);

  useEffect(() => {
    if (!open) return;
    setStep("intent");
    setReason("");
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
              What is the main reason? You can prefer not to say and continue at any time.
            </p>
            <label className="form-group">
              <span className="label">Main reason</span>
              <select className="form-input" value={reason} onChange={(event) => setReason(event.target.value as SubscriptionCancellationReason)}>
                <option value="">Choose a reason</option>
                {SUBSCRIPTION_CANCELLATION_REASONS.map((item) => (
                  <option key={item.value} value={item.value}>{item.label}</option>
                ))}
              </select>
            </label>

            {saveOption && reason && (
              <div className="subscription-retention-save">
                <strong>{saveOption.title}</strong>
                <p>{saveOption.detail}</p>
                <Link href={saveOption.href} className="settingsButton settingsButtonPrimary" onClick={() => onAlternative(reason, saveOption.href)}>
                  {saveOption.action}
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
                onClick={() => reason && onOpenPortal("cancellation", reason)}
                disabled={!reason || busy}
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
