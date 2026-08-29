export type SubscriptionCancellationReason =
  | "price"
  | "not_using"
  | "quality"
  | "missing_feature"
  | "difficult"
  | "technical"
  | "other"
  | "skip";

export const SUBSCRIPTION_CANCELLATION_REASONS: Array<{
  value: SubscriptionCancellationReason;
  label: string;
}> = [
  { value: "price", label: "Premium is not right for my budget" },
  { value: "not_using", label: "I am not using Note2Tabs enough" },
  { value: "quality", label: "The transcription results did not meet my needs" },
  { value: "missing_feature", label: "A feature I need is missing" },
  { value: "difficult", label: "The product was difficult to use" },
  { value: "technical", label: "I ran into a technical problem" },
  { value: "other", label: "Another reason" },
  { value: "skip", label: "Prefer not to say" },
];

export type SubscriptionSaveOption = {
  title: string;
  detail: string;
  href: string;
  action: string;
};

export function getSubscriptionSaveOption(
  reason: SubscriptionCancellationReason | ""
): SubscriptionSaveOption | null {
  if (reason === "price") {
    return {
      title: "Your work can stay on a free account",
      detail: "If you cancel in Stripe, Premium remains available through the current billing period and your saved tabs stay in your library.",
      href: "/tabs",
      action: "Review my saved tabs",
    };
  }
  if (reason === "not_using") {
    return {
      title: "Pick up where you left off",
      detail: "Your recent tabs are ready for editing or practice. One more session may help you decide whether Premium is still useful.",
      href: "/home",
      action: "Return to my workspace",
    };
  }
  if (reason === "quality") {
    return {
      title: "Complex recordings may need the Heavy model",
      detail: "Premium includes greater Heavy-model capacity. If a result was genuinely poor, tell us which recording failed so we can investigate it.",
      href: "/contact",
      action: "Get transcription help",
    };
  }
  if (reason === "missing_feature") {
    return {
      title: "Tell us what is missing",
      detail: "We can confirm whether the feature already exists, suggest a workflow, or use your request to guide the product.",
      href: "/contact",
      action: "Request a feature",
    };
  }
  if (reason === "difficult" || reason === "technical") {
    return {
      title: "Let us help before you leave",
      detail: "Describe what was confusing or broken and we will investigate it. You do not need to solve it alone.",
      href: "/contact",
      action: "Contact support",
    };
  }
  return null;
}
