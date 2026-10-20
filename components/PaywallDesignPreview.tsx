import { useState } from "react";
import LimitUpgradePrompt from "./LimitUpgradePrompt";
import type { LimitContext } from "../lib/limitUpgrade";
const MB = 1024 * 1024;
const scenarios: Record<
  string,
  { label: string; reason: string; context: LimitContext }
> = {
  youtube: {
    label: "YouTube too long",
    reason: "youtube_duration_limit",
    context: { plan: "FREE", clipSeconds: 90 },
  },
  file: {
    label: "File too large",
    reason: "file_size_limit",
    context: { plan: "FREE", fileBytes: 82 * MB },
  },
  credits: {
    label: "Not enough credits",
    reason: "credits_exhausted",
    context: { plan: "FREE", remaining: 1, required: 3 },
  },
  empty: {
    label: "No credits left",
    reason: "credits_exhausted",
    context: { plan: "FREE", remaining: 0 },
  },
  premium: {
    label: "Premium credits used",
    reason: "credits_exhausted",
    context: { plan: "PREMIUM", remaining: 0 },
  },
  pro: {
    label: "File needs Pro",
    reason: "pro_file_size_limit",
    context: { plan: "FREE", fileBytes: 320 * MB },
  },
};
/** Development-only harness uses the production component with payments/analytics disabled. */
export default function PaywallDesignPreview() {
  const [choice, setChoice] = useState("empty"),
    scenario = scenarios[choice];
  return (
    <LimitUpgradePrompt
      key={choice}
      preview
      context={scenario.context}
      tracking={{
        source: "premium_prompt",
        reason: scenario.reason,
        surface: "local_preview",
        trigger: "local_preview",
      }}
      previewControls={
        <div className="paywall-preview-tools">
          <span>Local preview</span>
          <select
            aria-label="Limit scenario"
            value={choice}
            onChange={(e) => setChoice(e.target.value)}
          >
            {Object.entries(scenarios).map(([key, s]) => (
              <option value={key} key={key}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      }
    />
  );
}
