import { useEffect, useMemo, useRef, useState, type ComponentProps } from "react";
import { createPortal } from "react-dom";
import type GteWorkspace from "./GteWorkspace";
import { addScoreNote, durationFrames, editScoreSelection, midiAtStep, nearestScorePitch, scoreEvents, snapScorePitch } from "../lib/gteNotation";
import { useLocale } from "../lib/i18n/react";
import { prepareTrackInstrument, schedulePreparedTrackNote } from "../lib/gteSamplePlayback";
import GteNotationToolbar from "./GteNotationToolbar";
import GteEngravedScore from "./GteEngravedScore";
import { buildNotationScore, notationKeyAlteration, notationPitch } from "../lib/gteNotationScore";

type Props = ComponentProps<typeof GteWorkspace>;
const NOTE_LETTERS: Record<string, number> = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
const control = "flex h-8 items-center justify-center rounded-md border border-slate-200 bg-white px-2.5 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-40";

export default function GteNotationWorkspace(props: Props) {
  const { snapshot, onSnapshotChange, isActive = false, editMenuDisabled = false, practiceMode = false } = props;
  const { t } = useLocale();
  const [selection, setSelection] = useState<{ noteIds: number[]; chordIds: number[] }>({ noteIds: [], chordIds: [] });
  const [write, setWrite] = useState(() => snapshot.notes.length + snapshot.chords.length === 0);
  const [accidental, setAccidental] = useState<-1 | 0 | 1 | null>(null);
  const [dotted, setDotted] = useState(false);
  const [localDenominator, setLocalDenominator] = useState(8);
  const [cursor, setCursor] = useState<{ frame: number; midi: number; staff?: "treble" | "bass" } | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const snapshotRef = useRef(snapshot);
  const audioRef = useRef<AudioContext | null>(null);
  const auditionId = useRef(0);
  snapshotRef.current = snapshot;
  const denominator = props.defaultNoteLengthDenominator ?? localDenominator;
  const entryLength = Math.round(durationFrames(snapshot, denominator) * (dotted ? 1.5 : 1));
  const entryPitch = (midi: number) => accidental === null && props.globalSnapToKeyEnabled ? snapScorePitch(midi, props.canvasKeyBase, props.canvasKeyType) : midi;
  const reading = Boolean(practiceMode || props.tabViewEnabled);
  const readOnly = editMenuDisabled || reading;
  const [guides, setGuides] = useState(false);
  const framesPerBar = snapshot.framesPerMessure || 480;
  const score = useMemo(() => buildNotationScore(snapshot, { keyBase: props.canvasKeyBase, keyType: props.canvasKeyType, timelineEnd: props.globalPlaybackTimelineEnd }), [snapshot, props.canvasKeyBase, props.canvasKeyType, props.globalPlaybackTimelineEnd]);
  const segments = useMemo(() => scoreEvents(snapshot), [snapshot]);
  const selectedRhythm = !write ? score.measures.flatMap((measure) => [...measure.voices.treble, ...measure.voices.bass].flat()).find((token) =>
    token.sources.some((source) => source.noteId !== undefined ? selection.noteIds.includes(source.noteId) : selection.chordIds.includes(source.chordId!))) : undefined;
  const barCount = score.measures.length;
  const commit = (next: typeof snapshot) => {
    if (readOnly || next === snapshotRef.current) return;
    snapshotRef.current = next;
    onSnapshotChange(next);
  };
  const audition = async (midi: number) => {
    if (snapshot.playbackMuted || props.globalPlaybackIsPlaying) return;
    const token = ++auditionId.current;
    try {
      const ctx = audioRef.current ?? new AudioContext();
      audioRef.current = ctx;
      await ctx.resume();
      const instrument = await prepareTrackInstrument(ctx, snapshot.instrumentId);
      if (ctx.state !== "running" || token !== auditionId.current) return;
      schedulePreparedTrackNote({ ctx, destination: ctx.destination, instrument, midi, gain: 0.35 * (snapshot.playbackVolume ?? 1) * (props.globalPlaybackVolume ?? 1), startTime: ctx.currentTime, duration: 0.25 });
    } catch { /* Entry remains usable if the browser blocks note audition. */ }
  };
  useEffect(() => () => { auditionId.current++; void audioRef.current?.close().catch(() => undefined); audioRef.current = null; }, []);
  const apply = (change: Parameters<typeof editScoreSelection>[2]) => {
    if (!selection.noteIds.length && !selection.chordIds.length) return;
    commit(editScoreSelection(snapshotRef.current, selection, change));
  };
  const add = (midi: number, frame: number, staff = cursor?.staff) => {
    if (readOnly) return;
    midi = entryPitch(midi);
    const result = addScoreNote(snapshotRef.current, midi, frame, entryLength, staff);
    commit(result.snapshot);
    setSelection({ noteIds: [result.note.id], chordIds: [] });
    setAccidental(null);
    
    setCursor({ frame, midi, staff });
    void audition(midi);
  };
  const chooseDuration = (value: number) => {
    setLocalDenominator(value); props.onDefaultNoteLengthDenominatorChange?.(value);
    if (count && !write) apply({ length: Math.round(durationFrames(snapshot, value) * ((selectedRhythm?.dotted ?? dotted) ? 1.5 : 1)) });
    if (!count) setWrite(true);
    root.current?.focus({ preventScroll: true });
  };
  useEffect(() => {
    props.onSelectionStateChange?.({ ...selection, noteCount: selection.noteIds.length, chordCount: selection.chordIds.length });
  }, [selection, props.onSelectionStateChange]);
  useEffect(() => {
    if (props.selectionClearExemptEditorId === props.editorId && props.selectionClearEpoch !== undefined) return;
    setSelection({ noteIds: [], chordIds: [] }); setCursor(null);   
  }, [props.editorId, props.selectionClearEpoch]);
  useEffect(() => {
    if (!isActive) { setSelection({ noteIds: [], chordIds: [] }); setCursor(null); }
  }, [isActive]);
  const count = selection.noteIds.length + selection.chordIds.length;
  const focus = () => { props.onFocusWorkspace?.(); root.current?.focus({ preventScroll: true }); };
  const rest = () => {
    if (readOnly) return;
    setWrite(true);
    setCursor({ midi: cursor?.midi ?? 60, frame: (cursor?.frame ?? 0) + entryLength, staff: cursor?.staff });
    setSelection({ noteIds: [], chordIds: [] });
    focus();
  };
  const toggleDot = () => {
    const next = !(selectedRhythm?.dotted ?? dotted);
    setDotted(next);
    if (count && !write) apply({ length: Math.round(durationFrames(snapshot, selectedRhythm?.denominator ?? denominator) * (next ? 1.5 : 1)) });
    focus();
  };
  const chooseAccidental = (value: -1 | 0 | 1) => {
    if (write) setAccidental(accidental === value ? null : value);
    else {
      const selectedEvents = segments.filter((event) => event.noteId !== undefined ? selection.noteIds.includes(event.noteId) : selection.chordIds.includes(event.chordId!));
      const first = selectedEvents[0];
      if (first) apply({ transpose: midiAtStep(notationPitch(first.midi, score.key).step) + value - first.midi });
    }
    focus();
  };
  const tools = <GteNotationToolbar input={write} guides={guides} onGuides={() => setGuides(!guides)} denominator={selectedRhythm?.denominator ?? denominator} dotted={selectedRhythm?.dotted ?? dotted} accidental={accidental} disabled={readOnly}
    onInput={(enabled) => { setWrite(enabled);  focus(); }}
    onDuration={chooseDuration} onDot={toggleDot} onRest={rest} onAccidental={chooseAccidental} />;

  return <div ref={root} tabIndex={0} data-gte-notation-editor="true" className="relative w-full pb-36 outline-none"
    onFocus={() => props.onFocusWorkspace?.()}
    onKeyDown={(event) => {
      if ((event.target as HTMLElement).closest("input,select,textarea") || readOnly || !isActive) return;
      if ((event.target as HTMLElement).closest("button") && (event.key === " " || event.key === "Enter")) return;
      const key = event.key.toLowerCase(), modifier = event.ctrlKey || event.metaKey;
      if (modifier && key === "a") { event.preventDefault(); event.stopPropagation(); setSelection({ noteIds: snapshot.notes.map((note) => note.id), chordIds: snapshot.chords.map((chord) => chord.id) }); }
      else if (modifier && key === "z") { event.preventDefault(); event.stopPropagation(); if (event.shiftKey) props.onRequestRedo?.(); else props.onRequestUndo?.(); }
      else if (key === "escape") { event.stopPropagation();   setWrite(false); setSelection({ noteIds: [], chordIds: [] }); setCursor(null);  }
      else if (!modifier && key === "n") { event.preventDefault(); event.stopPropagation(); setWrite(!write); }
      else if (!modifier && key === ".") { event.preventDefault(); event.stopPropagation(); toggleDot(); }
      else if (!modifier && (key === "0" || key === "r")) { event.preventDefault(); event.stopPropagation(); rest(); }
      else if (!modifier && /^[1-7]$/.test(key)) { event.preventDefault(); event.stopPropagation(); chooseDuration(2 ** (7 - Number(key))); }
      else if (key === "delete" || key === "backspace") { event.preventDefault(); event.stopPropagation(); apply({ remove: true }); setSelection({ noteIds: [], chordIds: [] }); }
      else if (key === "arrowup" || key === "arrowdown") {
        event.preventDefault(); event.stopPropagation();
        const delta = (key === "arrowup" ? 1 : -1) * (modifier || event.shiftKey ? 12 : 1);
        apply({ transpose: delta });
        if (cursor) setCursor({ ...cursor, midi: Math.max(0, Math.min(127, cursor.midi + delta)) });
      }
      else if (key === "arrowleft" || key === "arrowright") {
        event.preventDefault(); event.stopPropagation();
        if (write) setCursor({ midi: cursor?.midi ?? 60, frame: Math.max(0, (cursor?.frame ?? 0) + (key === "arrowleft" ? -1 : 1) * entryLength), staff: cursor?.staff });
        else {
          const ordered = [...new Map(segments.map((segment) => [segment.key, segment])).values()].sort((a, b) => a.start - b.start || a.midi - b.midi);
          const current = ordered.findIndex((segment) => segment.noteId !== undefined ? selection.noteIds.includes(segment.noteId) : selection.chordIds.includes(segment.chordId!));
          const next = ordered[Math.max(0, Math.min(ordered.length - 1, current + (key === "arrowleft" ? -1 : 1)))];
          if (next) { setSelection({ noteIds: next.noteId !== undefined ? [next.noteId] : [], chordIds: next.chordId !== undefined ? [next.chordId] : [] }); setCursor({ frame: next.start, midi: next.midi, staff: next.staff }); props.onGlobalPlaybackFrameChange?.(next.start); }
        }
      }
      else if (!modifier && NOTE_LETTERS[key] !== undefined && write) {
        event.preventDefault(); event.stopPropagation();
        const selectedEvent = segments.find((segment) => segment.noteId !== undefined ? selection.noteIds.includes(segment.noteId) : selection.chordIds.includes(segment.chordId!));
        const frame = event.shiftKey && selectedEvent ? selectedEvent.start : cursor?.frame ?? 0;
        const midi = Math.max(0, Math.min(127, nearestScorePitch(NOTE_LETTERS[key], cursor?.midi ?? selectedEvent?.midi ?? 60) + (accidental ?? notationKeyAlteration(key, score.key))));
        const staff = event.shiftKey ? selectedEvent?.staff : cursor?.staff;
        add(midi, frame, staff);
        setCursor({ midi: entryPitch(midi), frame: event.shiftKey ? cursor?.frame ?? frame : frame + entryLength, staff });
      }
      else if (key === " " && props.onGlobalPlaybackToggle) { event.preventDefault(); event.stopPropagation(); props.onGlobalPlaybackToggle(); }
    }}>
    {!reading && <div className="mb-3 px-5">
      {tools}
    </div>}
    {props.editMenuPortalTarget && !reading && isActive && createPortal(<div className="px-2 py-2">{tools}</div>, props.editMenuPortalTarget)}
    <GteEngravedScore score={score} input={write} disabled={readOnly} guides={guides && !reading} snapEnabled={props.globalSnapToGridEnabled !== false} denominator={denominator} dotted={dotted} length={entryLength}
      cursor={cursor ? { ...cursor, staff: cursor.staff ?? (cursor.midi < 60 ? "bass" : "treble") } : null} selection={selection}
      playbackFrame={props.globalPlaybackFrame ?? 0} playing={Boolean(props.globalPlaybackIsPlaying)}
      barsPerSystem={props.sharedRowCapacityBarCount ?? props.sharedViewportBarCount ?? 4} showBarNumbers={props.showBarNumbers !== false}
      transformPitch={(midi) => entryPitch(accidental === null ? midi : Math.max(0, Math.min(127, midiAtStep(notationPitch(midi, score.key).step) + accidental)))}
      onPoint={(point) => {
        focus(); props.onGlobalPlaybackFrameChange?.(point.frame);
        if (practiceMode) { props.onPracticeNotePlay?.(point.frame); return; }
        if (readOnly) return;
        setCursor(point);
        if (write) { add(point.midi, point.frame, point.staff); setCursor({ ...point, frame: point.frame + entryLength }); }
        else setSelection({ noteIds: [], chordIds: [] });
      }}
      onSelect={(source, shift) => {
        focus(); props.onGlobalPlaybackFrameChange?.(source.start);
        if (practiceMode) { props.onPracticeNotePlay?.(source.start); return; }
        setCursor({ frame: source.start + source.length, midi: source.midi, staff: source.staff });
        void audition(source.midi);
        setSelection((current) => {
          const selected = source.noteId !== undefined ? current.noteIds.includes(source.noteId) : current.chordIds.includes(source.chordId!);
          return source.noteId !== undefined
            ? { noteIds: shift ? selected ? current.noteIds.filter((id) => id !== source.noteId) : [...current.noteIds, source.noteId!] : [source.noteId], chordIds: shift ? current.chordIds : [] }
            : { noteIds: shift ? current.noteIds : [], chordIds: shift ? selected ? current.chordIds.filter((id) => id !== source.chordId) : [...current.chordIds, source.chordId!] : [source.chordId!] };
        });
      }}
      onMove={(sources, shift, transpose) => {
        const chosen = { noteIds: [...new Set(sources.flatMap((source) => source.noteId !== undefined ? [source.noteId] : []))],
          chordIds: [...new Set(sources.flatMap((source) => source.chordId !== undefined ? [source.chordId] : []))] };
        commit(editScoreSelection(snapshotRef.current, chosen, { shift, transpose }));
      }} />
    {!readOnly && <button className={control + " mx-auto mt-4"} onClick={() => commit({ ...snapshot, totalFrames: barCount * framesPerBar + framesPerBar })}>{t("Add bar")}</button>}
  </div>;
}
