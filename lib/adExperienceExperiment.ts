export const AD_EXPERIENCE_FLAG = "ad-experience";

export type AdExperienceVariant = "control" | "discreet-dismissible";

export function normalizeAdExperienceVariant(value: unknown): AdExperienceVariant {
  if (value === "control") return "control";
  return "discreet-dismissible";
}
