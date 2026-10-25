import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useLocale } from "../lib/i18n/react";

export default function GteVoiceAssignmentDialog({ selection, onCancel, onConfirm }: { selection: boolean; onCancel: () => void; onConfirm: () => void }) {
  const { t } = useLocale();
  const panel = useRef<HTMLDivElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    cancel.current?.focus();
    return () => previous?.focus({ preventScroll: true });
  }, []);
  return createPortal(<div data-gte-floating-ui="true" className="fixed inset-0 z-[11000] flex items-center justify-center bg-slate-950/25 px-4"
    onMouseDown={event => { if (event.target === event.currentTarget) onCancel(); }}>
    <div ref={panel} role="dialog" aria-modal="true" aria-labelledby="voice-assignment-title" aria-describedby="voice-assignment-description"
      className="w-full max-w-sm rounded-xl border border-slate-200 bg-[#faf9f5] p-5 shadow-xl"
      onKeyDown={event => {
        if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onCancel(); }
        if (event.key === "Tab") {
          const buttons = panel.current?.querySelectorAll<HTMLButtonElement>("button");
          if (!buttons?.length) return;
          if (event.shiftKey && document.activeElement === buttons[0]) { event.preventDefault(); buttons[buttons.length - 1].focus(); }
          else if (!event.shiftKey && document.activeElement === buttons[buttons.length - 1]) { event.preventDefault(); buttons[0].focus(); }
        }
      }}>
      <h2 id="voice-assignment-title" className="m-0 text-base font-semibold text-slate-900">{t("Auto assign voices?")}</h2>
      <p id="voice-assignment-description" className="mb-5 mt-2 text-sm leading-relaxed text-slate-600">
        {t(selection ? "Recalculate voices for the selected notes. Manually locked voices will stay unchanged." : "Recalculate voices for this track. Manually locked voices will stay unchanged.")}
      </p>
      <div className="flex justify-end gap-2">
        <button ref={cancel} type="button" onClick={onCancel} className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 hover:bg-slate-50">{t("Cancel")}</button>
        <button type="button" onClick={onConfirm} className="h-9 rounded-lg bg-slate-900 px-3 text-sm text-white hover:bg-slate-800">{t("Assign voices")}</button>
      </div>
    </div>
  </div>, document.body);
}
