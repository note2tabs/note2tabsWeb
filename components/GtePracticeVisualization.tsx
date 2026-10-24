import { useEffect, useState } from "react";
import type { ComponentProps, ReactNode } from "react";
import dynamic from "next/dynamic";
import type GteWorkspace from "./GteWorkspace";
import { useLocale } from "../lib/i18n/react";

const PianoRoll = dynamic(() => import("./GtePracticePianoRoll"));
const preferenceKey = "note2tabs.practice.visualization.v1";

export default function GtePracticeVisualization({ children, ...props }: ComponentProps<typeof GteWorkspace> & { children: ReactNode }) {
  const { t } = useLocale();
  const [mode, setMode] = useState("notation");
  useEffect(() => {
    try { if (localStorage.getItem(preferenceKey) === "piano-roll") setMode("piano-roll"); } catch { /* Storage can be disabled. */ }
  }, []);
  return <div className="min-w-0">
    <div className="mb-3 flex justify-center" data-gte-editor-control="true">
      <div role="group" aria-label={t("Practice visualization")} className="inline-flex rounded-lg border border-slate-200 bg-[#f1f5f9] p-0.5 text-sm">
        {[["notation", "Notation"], ["piano-roll", "Piano roll"]].map(([value, label]) => <button key={value} type="button" aria-pressed={mode === value}
          className={`rounded-md px-3 py-1.5 ${mode === value ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:bg-white/60"}`}
          onClick={() => { setMode(value); try { localStorage.setItem(preferenceKey, value); } catch { /* Keep session usable. */ } }}>{t(label)}</button>)}
      </div>
    </div>
    {mode === "piano-roll" ? <PianoRoll {...props} /> : children}
  </div>;
}
