import Link from "next/link";

type PremiumConversionCardBaseProps = {
  title: string;
  description: string;
  actionLabel: string;
  resetMessage?: string;
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
}: PremiumConversionCardProps) {
  return (
    <aside className="premium-conversion-card" aria-label="Premium subscription">
      <div className="premium-conversion-card__copy">
        <span>Note2Tabs Premium</span>
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
          Eligible new subscribers get a 7-day trial · $5.99/month · Cancel anytime
          {resetMessage ? ` · ${resetMessage}` : ""}
        </small>
      </div>
    </aside>
  );
}
