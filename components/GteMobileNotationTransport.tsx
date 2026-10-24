import { createPortal } from "react-dom";
import { useLocale } from "../lib/i18n/react";

type Props = {
  visible: boolean;
  playing: boolean;
  preparing: boolean;
  onToggle: () => void;
  onStart: () => void;
  portalTarget?: Element | null;
};

/** One song transport, accessible in mobile sheets, MIDI and practice views. */
export default function GteMobileNotationTransport({visible,playing,preparing,onToggle,onStart,portalTarget}: Props) {
  const { t } = useLocale();
  if (!visible || typeof document === "undefined") return null;
  return createPortal(
    <div data-gte-mobile-notation-transport="true" data-gte-floating-ui="true"
      role="toolbar" aria-label={t("Playback controls")}
      className="fixed right-3 z-[9997] flex gap-1 rounded-2xl border border-slate-200 bg-white/95 p-2 text-slate-700 shadow-[0_14px_40px_rgba(15,23,42,0.18)] backdrop-blur"
      style={{bottom:"max(0.75rem, env(safe-area-inset-bottom))"}}>
      <button type="button" onClick={onStart} title={t("Go to start")} aria-label={t("Go to start")}
        className="flex h-11 w-11 items-center justify-center rounded-full active:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-700">
        <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current" aria-hidden="true"><rect x="4" y="5" width="2" height="14"/><polygon points="18,5 8,12 18,19"/></svg>
      </button>
      <button type="button" onClick={onToggle} title={playing?t("Pause"):t("Play")} aria-label={playing?t("Pause"):t("Play")}
        disabled={preparing} aria-busy={preparing}
        className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-900 text-white active:bg-slate-700 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-700">
        <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current" aria-hidden="true">
          {playing?<><rect x="6" y="5" width="4" height="14"/><rect x="14" y="5" width="4" height="14"/></>:<polygon points="8,5 19,12 8,19"/>}
        </svg>
      </button>
    </div>,portalTarget ?? document.body,
  );
}
