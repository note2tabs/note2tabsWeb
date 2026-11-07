import type { ReactNode } from "react";
import Link from "./LocaleLink";

type Props = {
  /** "verify" for email verification, "credits" for credit shortfalls. Only changes the accent. */
  tone: "verify" | "credits";
  title: string;
  description: string;
  /** Small label above the title. */
  eyebrow?: string;
  /** Secondary line under the description, e.g. when credits reset. */
  detail?: string;
  actionLabel?: string;
  href?: string;
  role?: "alert" | "status";
  children?: ReactNode;
};

const ICONS = {
  verify: <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="3" /><path d="m4 8 8 6 8-6" /></svg>,
  credits: <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>,
};

/** The page's own "you can't continue yet, and here is what to do" card. Strings are already translated by the caller. */
export default function TranscriptionBlockCard({ tone, title, description, eyebrow, detail, actionLabel, href, role = "status", children }: Props) {
  return (
    <aside className={`transcription-block-card transcription-block-card--${tone}`} role={role}>
      <span className="transcription-block-card__icon" aria-hidden="true">{ICONS[tone]}</span>
      <div className="transcription-block-card__copy">
        {eyebrow && <span className="transcription-block-card__eyebrow">{eyebrow}</span>}
        <h3>{title}</h3>
        <p>{description}</p>
        {detail && <small>{detail}</small>}
        {children}
      </div>
      {href && actionLabel && (
        <Link href={href} className="button-primary button-small transcription-block-card__action">{actionLabel}</Link>
      )}
    </aside>
  );
}
