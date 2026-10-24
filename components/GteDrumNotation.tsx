import { useEffect, useMemo, useRef, useState, type ComponentProps } from "react";
import type GteWorkspace from "./GteWorkspace";
import GteEngravedScore from "./GteEngravedScore";
import { buildDrumNotationScore, DRUM_NOTATION_POSITIONS } from "../lib/gteDrumNotation";
import { DRUM_VOICES, getDrumVoiceByMidi } from "../lib/gteDrums";
import { insertDrumNotationHit, moveDrumNotationHits } from "../lib/gteDrumNotationEditing";
import { previewDrumVoice } from "../lib/gteDrumPlayback";
import { NotationValueSymbol } from "./GteNotationToolbar";
import { useLocale } from "../lib/i18n/react";

export default function GteDrumNotation(props: ComponentProps<typeof GteWorkspace>) {
  const { t } = useLocale();
  const root = useRef<HTMLDivElement>(null);
  const [write, setWrite] = useState(false);
  const [voiceIndex, setVoiceIndex] = useState(6);
  const [denominator, setDenominator] = useState(8);
  const [selected, setSelected] = useState<number[]>([]);
  const readOnly = Boolean(props.practiceMode || props.editMenuDisabled);
  const score = useMemo(() => buildDrumNotationScore(props.snapshot), [props.snapshot]);
  const length = score.framesPerBar * score.denominator / score.numerator / denominator;
  const voice = DRUM_VOICES[voiceIndex];
  const commit = (next: typeof props.snapshot) => { if (!readOnly && next !== props.snapshot) props.onSnapshotChange(next, { recordHistory: true, markDirty: true }); };
  const remove = () => { const ids = new Set(selected); commit({ ...props.snapshot, notes: props.snapshot.notes.filter(note => !ids.has(note.id)) }); setSelected([]); };
  useEffect(() => {
    const outside = (event: PointerEvent) => { if (event.target instanceof Node && !root.current?.contains(event.target)) { setWrite(false); setSelected([]); } };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, []);
  const seek = (frame: number) => {
    props.onGlobalPlaybackFrameChange?.(frame);
    if (props.practiceMode) props.onPracticeNotePlay?.(frame);
  };
  return <div ref={root} tabIndex={0} className="relative grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-2 pb-36 outline-none"
    onPointerDown={() => { props.onFocusWorkspace?.(); root.current?.focus({ preventScroll: true }); }}
    onKeyDown={event => {
      if (readOnly) return;
      if (event.key === "Escape") { event.stopPropagation(); setWrite(false); setSelected([]); }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") { event.preventDefault(); event.stopPropagation(); if (event.shiftKey) props.onRequestRedo?.(); else props.onRequestUndo?.(); }
      if (selected.length && (event.key === "Delete" || event.key === "Backspace")) { event.preventDefault(); event.stopPropagation(); remove(); }
    }}>
    <div className={readOnly ? "col-span-2 min-w-0" : "min-w-0"} style={{ zoom: 0.75 }}>
    <GteEngravedScore score={score} editorId={props.editorId} input={write && !readOnly} disabled={readOnly}
      snapEnabled={true} denominator={denominator} dotted={false} length={length}
      cursor={null} selection={{ noteIds: selected, chordIds: [] }}
      playbackFrame={props.globalPlaybackFrame ?? 0} playing={Boolean(props.globalPlaybackIsPlaying)}
      getPlaybackFrame={props.getGlobalPlaybackFrame} showBarNumbers={props.showBarNumbers !== false}
      transformPitch={midi => write ? DRUM_NOTATION_POSITIONS[voice.id].midi : midi}
      sourcePitch={source => DRUM_NOTATION_POSITIONS[getDrumVoiceByMidi(source.midi)?.id ?? "snare"].midi}
      onPoint={point => {
        seek(point.frame);
        if (readOnly) return;
        if (write) { commit(insertDrumNotationHit(props.snapshot, voiceIndex, point.frame)); void previewDrumVoice(voice.id); }
        else setSelected([]);
      }}
      onSelect={(source, shift) => {
        seek(source.start);
        if (readOnly || source.noteId === undefined) return;
        setWrite(false);
        const id = source.noteId;
        setSelected(current => shift ? current.includes(id) ? current.filter(value => value !== id) : [...current, id] : [id]);
        const instrument = getDrumVoiceByMidi(source.midi); if (instrument) void previewDrumVoice(instrument.id);
      }}
      onBoxSelect={(sources, additive) => { if (!readOnly) { setWrite(false); setSelected(current => [...new Set([...(additive ? current : []), ...sources.flatMap(source => source.noteId === undefined ? [] : [source.noteId])])]); } }}
      onMove={(sources, shift, transpose) => commit(moveDrumNotationHits(props.snapshot, sources.flatMap(source => source.noteId === undefined ? [] : [source.noteId]), shift, transpose))}
      onAddBar={readOnly ? undefined : () => commit({ ...props.snapshot, totalFrames: props.snapshot.totalFrames + score.framesPerBar })} />
    </div>
    {!readOnly && <div role="toolbar" aria-label={t("Drum notation tools")} data-gte-editor-control="true" className="sticky top-44 grid w-32 gap-2 rounded-xl border border-slate-200 bg-[#faf9f5] p-2 text-xs shadow-sm">
      <div className="grid grid-cols-2 gap-1">
        {([false, true] as const).map(redo => <button key={String(redo)} type="button" className="flex items-center justify-center rounded-md p-1.5 hover:bg-slate-100" aria-label={t(redo ? "Redo" : "Undo")} title={t(redo ? "Redo · Ctrl+Shift+Z" : "Undo · Ctrl+Z")} onClick={redo ? props.onRequestRedo : props.onRequestUndo}>
          <span aria-hidden="true" className="h-4 w-4 bg-current" style={{ maskImage: `url(/icons/${redo ? "redo" : "undo"}-transparent.png)`, WebkitMaskImage: `url(/icons/${redo ? "redo" : "undo"}-transparent.png)`, maskSize: "contain", WebkitMaskSize: "contain", maskRepeat: "no-repeat", WebkitMaskRepeat: "no-repeat", maskPosition: "center", WebkitMaskPosition: "center" }} />
        </button>)}
      </div>
      <span className="text-[10px] text-slate-500">{t("Instrument")}</span>
      <div className="grid grid-cols-2 gap-1">{DRUM_VOICES.map((instrument, index) => <button key={instrument.id} type="button" title={t(instrument.label)} aria-label={t(instrument.label)} aria-pressed={write && voiceIndex === index}
        className={`rounded-md px-1 py-1.5 ${write && voiceIndex === index ? "bg-emerald-100 text-emerald-900" : "hover:bg-slate-100"}`}
        onClick={() => { setVoiceIndex(index); setWrite(true); setSelected([]); }}>{instrument.shortLabel}</button>)}</div>
      <span className="border-t border-slate-200 pt-2 text-[10px] text-slate-500">{t("Grid")}</span>
      <div className="grid grid-cols-2 gap-1">{[4, 8, 16, 32, 64].map(value => <button key={value} type="button" title={`1/${value}`} aria-label={`${t("Grid")} 1/${value}`} aria-pressed={denominator === value}
        className={`flex flex-col items-center rounded-md py-1 ${denominator === value ? "bg-emerald-100 text-emerald-900" : "hover:bg-slate-100"}`}
        onClick={() => { setDenominator(value); setWrite(true); }}><NotationValueSymbol index={[1, 2, 4, 8, 16, 32, 64].indexOf(value)} /><span className="text-[9px]">1/{value}</span></button>)}</div>
      <button type="button" disabled={!selected.length} className="rounded-md p-1.5 hover:bg-slate-100 disabled:opacity-40" onClick={remove}>{t("Delete")}</button>
    </div>}
  </div>;
}
