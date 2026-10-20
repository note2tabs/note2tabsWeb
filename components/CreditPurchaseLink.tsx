import { useState } from "react";
import Link from "./LocaleLink";
import { useLocale } from "../lib/i18n/react";
export default function CreditPurchaseLink({
  beforeNavigate,
  button = false,
  credits,
}: {
  beforeNavigate?: () => Promise<void>;
  button?: boolean;
  credits?: number;
}) {
  const { t, href } = useLocale();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(false);
  if (process.env.NEXT_PUBLIC_CREDIT_TOPUPS_ENABLED !== "true") return null;
  const target = "/credits" + (credits ? `?credits=${credits}` : "");
  return (
    <>
      <Link
        href={target}
        className={
          button
            ? "settingsButton settingsButtonSecondary"
            : "credit-purchase-inline"
        }
        aria-disabled={busy}
        onClick={async (event) => {
          if (!beforeNavigate) return;
          event.preventDefault();
          if (busy) return;
          setBusy(true);
          try {
            await beforeNavigate();
            window.location.assign(href(target));
          } catch {
            setBusy(false);
            setError(true);
          }
        }}
      >
        {t("Buy credits")}
      </Link>
      {error && (
        <span role="alert">
          {t("Could not save your selection. Please try again.")}
        </span>
      )}
    </>
  );
}
