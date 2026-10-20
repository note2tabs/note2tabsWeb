import { useEffect, useRef } from "react";
import { useLocale } from "../lib/i18n/react";

export type CreditUpgradeQuote = { id: string; currency: string; credits: number; discount: number; regularAmount: number; dueNow: number };
export default function CreditUpgradeReview({ quote, busy, onCancel, onConfirm }: { quote: CreditUpgradeQuote | null; busy: boolean; onCancel: () => void; onConfirm: () => void }) {
  const { t, locale } = useLocale();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (quote && dialog && !dialog.open) dialog.showModal();
    if (!quote && dialog?.open) dialog.close();
  }, [quote]);
  const money = (amount: number) => new Intl.NumberFormat(locale, { style: "currency", currency: quote?.currency || "USD" }).format(amount / 10 ** new Intl.NumberFormat(locale, { style: "currency", currency: quote?.currency || "USD" }).resolvedOptions().maximumFractionDigits!);
  return <dialog ref={ref} aria-labelledby="credit-upgrade-heading" onCancel={event => { event.preventDefault(); if (!busy) onCancel(); }} className="w-[calc(100%-2rem)] max-w-md rounded-2xl bg-white p-7 text-slate-950 shadow-2xl backdrop:bg-slate-950/40">
    {quote && <>
      <h2 id="credit-upgrade-heading" className="text-2xl font-semibold tracking-tight">{t("Upgrade to Pro")}</h2>
      <dl className="my-6 space-y-4 text-sm">
        <div className="flex justify-between gap-4"><dt>{t("Pro monthly price")}</dt><dd>{money(quote.regularAmount)}</dd></div>
        <div className="flex justify-between gap-4"><dt>{t("Credit exchange ({credits} credits)", { credits: quote.credits })}</dt><dd>−{money(quote.discount)}</dd></div>
        <div className="flex justify-between gap-4 border-t pt-4 text-lg font-semibold"><dt>{t("Due today")}</dt><dd>{money(quote.dueNow)}</dd></div>
      </dl>
      <p className="mb-6 text-sm leading-relaxed text-slate-600">{t("Your remaining credits are exchanged for this discount. You start a new month with 250 Pro credits. Then {amount} per month, starting one month after the upgrade.", { amount: money(quote.regularAmount) })}</p>
      <button type="button" disabled={busy} className="w-full rounded-lg bg-slate-950 px-4 py-3 font-medium text-white disabled:opacity-50" onClick={onConfirm}>{busy ? t("Processing…") : t("Confirm upgrade")}</button>
      <button type="button" disabled={busy} className="mt-2 w-full rounded-lg px-4 py-3 text-sm" onClick={onCancel}>{t("Cancel")}</button>
    </>}
  </dialog>;
}
