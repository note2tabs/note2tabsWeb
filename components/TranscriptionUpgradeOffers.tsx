import PremiumConversionCard from "./PremiumConversionCard";
import PremiumHomeCallout from "./PremiumHomeCallout";
import { useLocale } from "../lib/i18n/react";
import { premiumPricingHref } from "../lib/premiumFunnel";
import { MAX_FREE_FILE_SNIPPET_SEC } from "../lib/transcriptionClip";
import type { SubscriptionPlan } from "../lib/subscriptionPlans";

type Props = {
  plan: SubscriptionPlan;
  mode: "FILE" | "YOUTUBE";
  fileSelected: boolean;
  fileDuration: number | null;
  youtubeValid: boolean;
  remaining?: number;
  signedIn: boolean;
  resetLabel: string;
  suppressed: boolean;
};

/** Helpful offers for valid free selections; actual limit dialogs take priority. */
export default function TranscriptionUpgradeOffers(props: Props) {
  const { t } = useLocale();
  if (props.suppressed || props.plan !== "FREE" || props.remaining === 0) return null;
  if (props.signedIn && props.remaining !== undefined && props.remaining > 0 && props.remaining <= 3) {
    return <PremiumConversionCard
      title={t("Keep transcribing today")}
      description={t("Premium includes 100 monthly credits, rollover, and full-song audio uploads.")}
      actionLabel={t("See Premium")}
      href={premiumPricingHref({source:"low_credits",reason:"credits_low"})}
      resetMessage={t("Free credits reset {date}", {date:props.resetLabel})}
      tracking={{source:"low_credits",reason:"credits_low",surface:"low_credits_card",trigger:"credits_threshold_reached"}}
    />;
  }
  if (props.mode === "FILE" && props.fileSelected && (props.fileDuration || 0) > MAX_FREE_FILE_SNIPPET_SEC) {
    return <PremiumConversionCard
      title={t("Transcribe more of this file")}
      description={t("Free accounts can select up to 60 seconds. Premium unlocks full-length audio-file transcription.")}
      actionLabel={t("See longer options")}
      href={premiumPricingHref({source:"premium_prompt",reason:"file_duration_limit"})}
      tracking={{source:"premium_prompt",reason:"file_duration_limit",surface:"file_duration_limit_card",trigger:"long_file_selected"}}
    />;
  }
  return props.mode === "YOUTUBE" ? <PremiumHomeCallout show={props.youtubeValid} /> : null;
}
