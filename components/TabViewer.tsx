import { useLocale } from "../lib/i18n/react";
type TabViewerProps = {
  tabText?: string;
  songTitle?: string;
  segments?: string[][];
};

export default function TabViewer({ tabText, songTitle, segments }: TabViewerProps) {
  const {t}=useLocale();
  void tabText;
  void songTitle;
  void segments;
  return (
    <div className="stack" aria-live="polite" aria-busy="true">
      <p>{t("Preparing your editor")}…</p>
    </div>
  );
}
