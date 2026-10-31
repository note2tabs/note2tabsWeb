import tools from "./tools.json";
import { instrumentGuides } from "../../instrumentGuideIndex";
import type { AppLocale } from "../locale";

/** Music-specific labels avoid speech-transcription wording on instrument guides. */
export function localizedGuideTools(slug: string, locale: AppLocale) {
  const guide = instrumentGuides.find(item => item.slug === slug);
  if (!guide || locale === "en") return null;
  const copy = tools[locale][guide.instrument];
  return {...copy, goal: guide.goal};
}
