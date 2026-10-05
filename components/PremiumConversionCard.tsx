import Link from "next/link";

type PremiumConversionCardBaseProps = {
  title: string;
  description: string;
  actionLabel: string;
  resetMessage?: string;
  planLabel?: string;
  reassurance?: string;
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
  reassurance = "$5.99 billed today · Cancel anytime",
}: PremiumConversionCardProps) {
  return (
    <aside className="premium-conversion-card" aria-label="Premium subscription">
      <div className="premium-conversion-card__copy">
        <span>{planLabel}</span>
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
      <div className="premium-conversion-card__action">
        {href ? (
          <Link href={href} className="button-primary button-small">
            {actionLabel}
          </Link>
        ) : (
          <button
            type="button"
            className="button-primary button-small"
            onClick={onAction}
            disabled={busy}
          >
            {busy ? "Opening checkout…" : actionLabel}
          </button>
        )}
        <small>
          {reassurance}
          {resetMessage ? ` · ${resetMessage}` : ""}
        </small>
      </div>
    </aside>
  );
}
