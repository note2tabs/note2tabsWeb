import type { AppLocale } from "../locale";
import { instrumentGuideGroups, instrumentGuidesForPath } from "../../instrumentGuideIndex";
import metadata from "./metadata.json";

type GuideMetadata = { title: string; excerpt: string; sourceUpdatedAt: string };
export const instrumentGuideMetadata = metadata as Partial<Record<AppLocale, Record<string, GuideMetadata>>>;

const headings: Record<AppLocale, [string, string, string, string, string]> = {
  en: ["Piano, bass, drums and ukulele", "Piano guides", "Bass guides", "Drum guides", "Ukulele guides"],
  "pt-BR": ["Piano, baixo, bateria e ukulele", "Guias de piano", "Guias de baixo", "Guias de bateria", "Guias de ukulele"],
  es: ["Piano, bajo, batería y ukelele", "Guías de piano", "Guías de bajo", "Guías de batería", "Guías de ukelele"],
  fr: ["Piano, basse, batterie et ukulélé", "Guides de piano", "Guides de basse", "Guides de batterie", "Guides de ukulélé"],
  it: ["Pianoforte, basso, batteria e ukulele", "Guide per pianoforte", "Guide per basso", "Guide per batteria", "Guide per ukulele"],
  ja: ["ピアノ・ベース・ドラム・ウクレレ", "ピアノのガイド", "ベースのガイド", "ドラムのガイド", "ウクレレのガイド"],
  ko: ["피아노·베이스·드럼·우쿨렐레", "피아노 가이드", "베이스 가이드", "드럼 가이드", "우쿨렐레 가이드"],
  pl: ["Fortepian, bas, perkusja i ukulele", "Poradniki fortepianowe", "Poradniki basowe", "Poradniki perkusyjne", "Poradniki ukulele"],
  ar: ["البيانو والباص والدرامز واليوكليلي", "أدلة البيانو", "أدلة الباص", "أدلة الدرامز", "أدلة اليوكليلي"],
  "zh-Hans": ["钢琴、贝斯、鼓组与尤克里里", "钢琴指南", "贝斯指南", "鼓组指南", "尤克里里指南"],
};
const instruments = ["piano", "bass", "drums", "ukulele"];
export function instrumentGuideHeading(locale: AppLocale, instrument?: string) {
  return headings[locale][instrument ? instruments.indexOf(instrument) + 1 : 0];
}
export function localizedInstrumentGuideGroups(locale: AppLocale) {
  return instrumentGuideGroups.map(group => ({
    ...group,
    guides: group.guides.flatMap(guide => {
      if (locale === "en") return [guide];
      const row = instrumentGuideMetadata[locale]?.[guide.slug];
      return row ? [{...guide, title: row.title, excerpt: row.excerpt}] : [];
    }),
  })).filter(group => group.guides.length > 0);
}
export function localizedInstrumentGuidesForPath(path: string, locale: AppLocale) {
  const instrument = instrumentGuidesForPath(path)?.instrument;
  return localizedInstrumentGuideGroups(locale).find(group => group.instrument === instrument);
}
