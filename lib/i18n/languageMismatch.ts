import { deviceLocale } from "./detection";
import { localeEnabled, type AppLocale } from "./locale";
import {validLocale} from "./preference";

/** Development-only interactive preview; never changes production routing. */
export function languagePromptPreview(path: string): AppLocale | null {
  return process.env.NODE_ENV === "development"
    ? validLocale(new URL(path, "http://localhost").searchParams.get("languagePromptPreview")) : null;
}

/** Unsupported browser languages use English; URL language remains independently measurable. */
export function languageMismatchTarget(page: AppLocale, browserLanguages: string, enabled = localeEnabled): AppLocale | null {
  if (!browserLanguages.trim()) return null;
  const preferred = deviceLocale(browserLanguages, enabled);
  return preferred === page ? null : preferred;
}

export const mismatchCopy: Record<AppLocale, {continue: string; stay: string; label: string}> = {
  en: {continue: "Continue in English", stay: "Keep this language", label: "Language preference"},
  fr: {continue: "Continuer en français", stay: "Garder la langue actuelle", label: "Préférence de langue"},
  it: {continue: "Continua in italiano", stay: "Mantieni la lingua attuale", label: "Preferenza della lingua"},
  "pt-BR": {continue: "Continuar em português", stay: "Manter o idioma atual", label: "Preferência de idioma"},
  es: {continue: "Continuar en español", stay: "Mantener el idioma actual", label: "Preferencia de idioma"},
  ja: {continue: "日本語で続ける", stay: "現在の言語のままにする", label: "言語設定"},
  ko: {continue: "한국어로 계속하기", stay: "현재 언어 유지", label: "언어 설정"},
  pl: {continue: "Kontynuuj po polsku", stay: "Zachowaj obecny język", label: "Preferencje językowe"},
  ar: {continue: "المتابعة بالعربية", stay: "الاحتفاظ باللغة الحالية", label: "تفضيل اللغة"},
  "zh-Hans": {continue: "使用简体中文继续", stay: "保留当前语言", label: "语言偏好"},
};
