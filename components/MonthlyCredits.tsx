import { useLocale } from "../lib/i18n/react";

// Translate the entire phrase so languages can place the number naturally.
export default function MonthlyCredits({ count, tenTimesMore = false }: { count: number; tenTimesMore?: boolean }) {
  const { t } = useLocale();
  const [before, after] = t(tenTimesMore ? "{count} monthly credits—10× more" : "{count} monthly credits").split("{count}");
  return <>{before}<strong>{count}</strong>{after}</>;
}
