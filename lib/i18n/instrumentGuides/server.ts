/** Article bodies are server-only; navigation imports the small metadata index. */
import ar from "../../../data/instrument-guides/localized/ar.json";
import es from "../../../data/instrument-guides/localized/es.json";
import fr from "../../../data/instrument-guides/localized/fr.json";
import it from "../../../data/instrument-guides/localized/it.json";
import ja from "../../../data/instrument-guides/localized/ja.json";
import ko from "../../../data/instrument-guides/localized/ko.json";
import pl from "../../../data/instrument-guides/localized/pl.json";
import pt from "../../../data/instrument-guides/localized/pt-BR.json";
import zh from "../../../data/instrument-guides/localized/zh-Hans.json";
import type { AppLocale } from "../locale";
export const instrumentGuideTranslations: Partial<Record<AppLocale, Record<string, typeof ar[keyof typeof ar]>>> = {
  ar, es, fr, it, ja, ko, pl, "pt-BR": pt, "zh-Hans": zh,
};
