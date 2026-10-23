import { useEffect, useMemo, useRef, useState, type ComponentProps, type MouseEvent } from "react";
import type GteWorkspace from "./GteWorkspace";
import { addScoreNote, addScoreRest, durationFrames, editScoreSelection, midiAtStep, nearestScorePitch, scoreEvents, snapScorePitch, setScoreVoice, toggleScoreConnection, validNotationTie } from "../lib/gteNotation";
import { useLocale } from "../lib/i18n/react";
import { prepareTrackInstrument, schedulePreparedTrackNote } from "../lib/gteSamplePlayback";
import GteNotationToolbar from "./GteNotationToolbar";
import GteEngravedScore from "./GteEngravedScore";
import { buildNotationScore, notationKeyAlteration, notationPitch } from "../lib/gteNotationScore";
import { readPitchedViewState, savePitchedViewState } from "../lib/gtePitchedViewState";

type Props = ComponentProps<typeof GteWorkspace>;
const NOTE_LETTERS: Record<string, number> = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };

export default function GteNotationWorkspace(props: Props) {
  const { snapshot, onSnapshotChange, isActive = false, editMenuDisabled = false, practiceMode = false } = props;
  const { t } = useLocale();
  const [selection, setSelection] = useState<{ noteIds: number[]; chordIds: number[] }>(() => {
    const keys = readPitchedViewState(props.editorId).selection ?? [];
    return { noteIds: keys.filter((key) => key.startsWith("n:")).map((key) => Number(key.split(":")[1])),
      chordIds: [...new Set(keys.filter((key) => key.startsWith("c:")).map((key) => Number(key.split(":")[1])))] };
  });
  const clearEpoch = useRef(props.selectionClearEpoch);
  const [selectedBars, setSelectedBars] = useState<number[]>([]);
  const [barAnchor, setBarAnchor] = useState<number | null>(null);
  const [barInsertIndex, setBarInsertIndex] = useState<number | null>(null);
  const [barMenu, setBarMenu] = useState<{ x: number; y: number; insertIndex: number } | null>(null);
  const barMenuRef = useRef<HTMLDivElement>(null);
  const barClearEpoch = useRef(props.barSelectionClearEpoch);
  const clearBars = () => { setSelectedBars([]); setBarAnchor(null); setBarMenu(null); setBarInsertIndex(null); };
  const [write, setWrite] = useState(() => snapshot.notes.length + snapshot.chords.length === 0);
  const [restMode, setRestMode] = useState(false);
  const [voice, setVoice] = useState<1 | 2>(1);
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
  const entryLength = durationFrames(snapshot, denominator) * (dotted ? 1.5 : 1);
  const snapToKey = props.globalSnapToKeyEnabled ?? false;
  const entryPitch = (midi: number) => accidental === null && snapToKey ? snapScorePitch(midi, props.canvasKeyBase, props.canvasKeyType) : midi;
  const reading = Boolean(practiceMode || props.tabViewEnabled);
  const readOnly = editMenuDisabled || reading;
  const [toolbarTop, setToolbarTop] = useState(8);
  useEffect(() => {
    if (reading) return;
    const banner = document.querySelector(".gte-editor-sticky-banner");
    const update = () => setToolbarTop(Math.max(8, (banner?.getBoundingClientRect().bottom ?? 0) + 8));
    update();
    const observer = new ResizeObserver(update);
    if (banner) observer.observe(banner);
    window.addEventListener("scroll", update, { passive: true, capture: true });
    window.addEventListener("resize", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [reading]);
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) { setWrite(false); setCursor(null); }
    };
    document.addEventListener("pointerdown", outside, true);
    return () => document.removeEventListener("pointerdown", outside, true);
  }, []);
  const framesPerBar = snapshot.framesPerMessure || 480;
  const score = useMemo(() => buildNotationScore(snapshot, { keyBase: props.canvasKeyBase, keyType: props.canvasKeyType, timelineEnd: props.globalPlaybackTimelineEnd }), [snapshot, props.canvasKeyBase, props.canvasKeyType, props.globalPlaybackTimelineEnd]);
  const segments = useMemo(() => scoreEvents(snapshot), [snapshot]);
  const selectedRhythm = useMemo(() => !write && (selection.noteIds.length || selection.chordIds.length)
    ? score.measures.flatMap((measure) => [...measure.voices.treble, ...measure.voices.bass].flat()).find((token) =>
      token.sources.some((source) => source.noteId !== undefined ? selection.noteIds.includes(source.noteId) : selection.chordIds.includes(source.chordId!)))
    : undefined, [write, score, selection]);
  const barCount = score.measures.length;
  useEffect(() => { props.onBarSelectionStateChange?.(selectedBars); }, [selectedBars, props.onBarSelectionStateChange]);
  useEffect(() => {
    setSelectedBars(current => current.some(index => index >= barCount) ? current.filter(index => index < barCount) : current);
  }, [barCount]);
  useEffect(() => {
    if (barClearEpoch.current === props.barSelectionClearEpoch) return;
    barClearEpoch.current = props.barSelectionClearEpoch;
    if (props.barSelectionClearExemptEditorId !== props.editorId) clearBars();
  }, [props.barSelectionClearEpoch, props.barSelectionClearExemptEditorId, props.editorId]);
  useEffect(() => {
    if (!barMenu) return;
    barMenuRef.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus({ preventScroll: true });
    const close = (event: PointerEvent) => { if (!barMenuRef.current?.contains(event.target as Node)) setBarMenu(null); };
    document.addEventListener("pointerdown", close, true);
    return () => document.removeEventListener("pointerdown", close, true);
  }, [barMenu]);
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
    const result = addScoreNote(snapshotRef.current, midi, frame, entryLength, staff, voice);
    commit(result.snapshot);
    setSelection({ noteIds: [result.note.id], chordIds: [] });
    setAccidental(null);
    
    setCursor({ frame, midi, staff });
    void audition(midi);
  };
  const chooseDuration = (value: number, rest = false) => {
    clearBars();
    setLocalDenominator(value); props.onDefaultNoteLengthDenominatorChange?.(value);
    setWrite(true); setRestMode(rest); setSelection({ noteIds: [], chordIds: [] });
    root.current?.focus({ preventScroll: true });
  };
  useEffect(() => {
    props.onSelectionStateChange?.({ ...selection, noteCount: selection.noteIds.length, chordCount: selection.chordIds.length });
    savePitchedViewState(props.editorId, { selection: segments.filter((event) => event.noteId !== undefined ? selection.noteIds.includes(event.noteId) : selection.chordIds.includes(event.chordId!)).map((event) => event.key) });
  }, [selection, props.onSelectionStateChange]);
  useEffect(() => {
    if (clearEpoch.current === props.selectionClearEpoch) return;
    clearEpoch.current = props.selectionClearEpoch;
    if (props.selectionClearExemptEditorId === props.editorId && props.selectionClearEpoch !== undefined) return;
    setSelection({ noteIds: [], chordIds: [] }); setCursor(null);   
  }, [props.editorId, props.selectionClearEpoch]);
  useEffect(() => {
    if (!isActive) { setWrite(false); setSelection({ noteIds: [], chordIds: [] }); setCursor(null); clearBars(); }
  }, [isActive]);
  const count = selection.noteIds.length + selection.chordIds.length;
  const focus = () => { props.onFocusWorkspace?.(); root.current?.focus({ preventScroll: true }); };
  const selectBar = (index: number, event: MouseEvent<HTMLButtonElement>, context = false) => {
    if (readOnly) return;
    event.preventDefault(); event.stopPropagation(); focus();
    setWrite(false); setCursor(null); setSelection({ noteIds: [], chordIds: [] });
    const rect = event.currentTarget.getBoundingClientRect();
    const insertIndex = event.clientX - rect.left < rect.width / 2 ? index : index + 1;
    setBarInsertIndex(insertIndex);
    if (context) {
      if (!selectedBars.includes(index)) { setSelectedBars([index]); setBarAnchor(index); }
      setBarMenu({ x: event.clientX, y: event.clientY, insertIndex });
      return;
    }
    setBarMenu(null);
    if (event.shiftKey && barAnchor !== null) {
      const start = Math.min(barAnchor, index), end = Math.max(barAnchor, index);
      setSelectedBars(Array.from({ length: end - start + 1 }, (_, offset) => start + offset));
    } else if (props.mobileViewport) {
      const next = selectedBars.includes(index) ? selectedBars.filter(value => value !== index) : [...selectedBars, index].sort((a,b) => a-b);
      setSelectedBars(next); setBarAnchor(next.length ? index : null);
    } else if ((event.ctrlKey || event.metaKey) && isActive) {
      setSelectedBars(current => current.includes(index) ? current : [...current, index].sort((a,b) => a-b)); setBarAnchor(index);
    } else if (selectedBars.length === 1 && selectedBars[0] === index) {
      setSelectedBars([]); setBarAnchor(null);
    } else { setSelectedBars([index]); setBarAnchor(index); }
  };
  const copyBars = () => { if (selectedBars.length) void props.onRequestSelectedBarsCopy?.([...selectedBars]); setBarMenu(null); focus(); };
  const pasteBars = (at = barInsertIndex ?? selectedBars[0] ?? 0) => { if (props.barClipboardAvailable) void props.onRequestSelectedBarsPaste?.(at); setBarMenu(null); focus(); };
  const deleteBars = () => { if (selectedBars.length) void props.onRequestSelectedBarsDelete?.([...selectedBars]); setBarMenu(null); focus(); };
  const rest = (frame = cursor?.frame ?? 0, staff = cursor?.staff ?? "treble") => {
    if (readOnly) return;
    commit(addScoreRest(snapshotRef.current, { id: Math.max(0, ...(snapshotRef.current.notation?.rests ?? []).map((item) => item.id)) + 1, start: frame, length: entryLength, staff, voice, denominator, dotted }));
    setCursor({ midi: cursor?.midi ?? 60, frame: frame + entryLength, staff });
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
  const selectedEvents = segments.filter((event) => event.noteId !== undefined ? selection.noteIds.includes(event.noteId) : selection.chordIds.includes(event.chordId!));
  const selectedKeys = new Set(selectedEvents.map((event) => event.key));
  const connected = (kind: "ties" | "slurs") => (snapshot.notation?.[kind] ?? []).some((link) => selectedKeys.has(link.from) && selectedKeys.has(link.to));
  const tools = <GteNotationToolbar mode={write ? restMode ? "rest" : "note" : "select"} voice={voice}
    onUndo={props.onRequestUndo} onRedo={props.onRequestRedo} undoCount={props.historyUndoCount} redoCount={props.historyRedoCount}
    denominator={denominator} dotted={write ? dotted : selectedRhythm?.dotted ?? dotted} accidental={accidental} disabled={readOnly}
    tieActive={connected("ties")} slurActive={connected("slurs")}
    canTie={connected("ties") || selectedEvents.some((from) => selectedEvents.some((to) => validNotationTie(from, to)))}
    canSlur={connected("slurs") || selectedEvents.some((from) => selectedEvents.some((to) => from.start < to.start))}
    onDuration={chooseDuration} onDot={toggleDot} onAccidental={chooseAccidental}
    onVoice={(value) => { setVoice(value); if (count) commit(setScoreVoice(snapshotRef.current, selection, value)); focus(); }}
    onTie={() => { commit(toggleScoreConnection(snapshotRef.current, selection, "ties")); focus(); }}
    onSlur={() => { commit(toggleScoreConnection(snapshotRef.current, selection, "slurs")); focus(); }}
    canSnapToKey={count > 0} onSnapSelectionToKey={() => { apply({ snapKey: { root: props.canvasKeyBase ?? 0, type: props.canvasKeyType ?? 0 } }); focus(); }}
    onDelete={() => { if (selectedBars.length) deleteBars(); else apply({ remove: true }); setSelection({ noteIds: [], chordIds: [] }); focus(); }} />;

  return <div ref={root} tabIndex={0} data-gte-notation-editor="true" className="relative grid min-w-0 w-full max-w-full grid-cols-[minmax(0,1fr)_auto] items-start gap-2 pb-36 outline-none"
    onFocus={() => props.onFocusWorkspace?.()}
    onKeyDown={(event) => {
      if ((event.target as HTMLElement).closest("input,select,textarea") || readOnly || !isActive) return;
      if ((event.target as HTMLElement).closest("button") && (event.key === " " || event.key === "Enter")) return;
      const key = event.key.toLowerCase(), modifier = event.ctrlKey || event.metaKey;
      if (modifier && key === "c" && selectedBars.length && props.onRequestSelectedBarsCopy) { event.preventDefault(); event.stopPropagation(); copyBars(); }
      else if (modifier && key === "v" && props.barClipboardAvailable && barInsertIndex !== null && props.onRequestSelectedBarsPaste) { event.preventDefault(); event.stopPropagation(); pasteBars(); }
      else if (modifier && key === "a") { event.preventDefault(); event.stopPropagation(); clearBars(); setSelection({ noteIds: snapshot.notes.map((note) => note.id), chordIds: snapshot.chords.map((chord) => chord.id) }); }
      else if (modifier && key === "z") { event.preventDefault(); event.stopPropagation(); if (event.shiftKey) props.onRequestRedo?.(); else props.onRequestUndo?.(); }
      else if (modifier && key === "y") { event.preventDefault(); event.stopPropagation(); props.onRequestRedo?.(); }
      else if (key === "escape") { event.stopPropagation(); clearBars(); setWrite(false); setSelection({ noteIds: [], chordIds: [] }); setCursor(null); focus(); }
      else if (key === "delete" || key === "backspace") { event.preventDefault(); event.stopPropagation(); if (selectedBars.length) deleteBars(); else apply({ remove: true }); setSelection({ noteIds: [], chordIds: [] }); }
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
          if (next) { clearBars(); setSelection({ noteIds: next.noteId !== undefined ? [next.noteId] : [], chordIds: next.chordId !== undefined ? [next.chordId] : [] }); setCursor({ frame: next.start, midi: next.midi, staff: next.staff }); props.onGlobalPlaybackFrameChange?.(next.start); }
        }
      }
      else if (!modifier && NOTE_LETTERS[key] !== undefined && write) {
        event.preventDefault(); event.stopPropagation();
        if (restMode) { rest(); return; }
        const selectedEvent = segments.find((segment) => segment.noteId !== undefined ? selection.noteIds.includes(segment.noteId) : selection.chordIds.includes(segment.chordId!));
        const frame = event.shiftKey && selectedEvent ? selectedEvent.start : cursor?.frame ?? 0;
        const midi = Math.max(0, Math.min(127, nearestScorePitch(NOTE_LETTERS[key], cursor?.midi ?? selectedEvent?.midi ?? 60) + (accidental ?? notationKeyAlteration(key, score.key))));
        const staff = event.shiftKey ? selectedEvent?.staff : cursor?.staff;
        add(midi, frame, staff);
        setCursor({ midi: entryPitch(midi), frame: event.shiftKey ? cursor?.frame ?? frame : frame + entryLength, staff });
      }
      else if (key === " " && props.onGlobalPlaybackToggle) { event.preventDefault(); event.stopPropagation(); props.onGlobalPlaybackToggle(); }
    }}>
    {!reading && <div data-gte-notation-toolbar="true"
      className="sticky col-start-2 row-start-1 z-[100] min-w-0 rounded-xl border border-slate-200 bg-[#faf9f5]/95 p-1.5 shadow-sm"
      style={{ top: toolbarTop, boxSizing: "border-box" }}>
      {tools}
    </div>}
    <div className={reading ? "col-span-2 min-w-0" : "col-start-1 row-start-1 min-w-0"}>
    <GteEngravedScore score={score} input={write} restInput={restMode} disabled={readOnly} snapEnabled={true} denominator={denominator} dotted={dotted} length={entryLength}
      editorId={props.editorId} selectedBars={selectedBars}
      onBarSelect={readOnly ? undefined : selectBar}
      onBarContextMenu={readOnly ? undefined : (index, event) => selectBar(index, event, true)}
      barDragging={!readOnly && Boolean(props.activeBarDrag)}
      onBarDragStart={readOnly ? undefined : (index, event) => {
        if (!selectedBars.includes(index)) { event.preventDefault(); return; }
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("application/x-gte-bars", JSON.stringify({ editorId: props.editorId, barIndices: selectedBars }));
        setBarMenu(null); props.onBarDragStart?.([...selectedBars]);
      }}
      onBarDragEnd={props.onBarDragEnd}
      onBarDrop={readOnly ? undefined : (index) => { void props.onRequestBarDrop?.(index); }}
      cursor={cursor ? { ...cursor, staff: cursor.staff ?? (cursor.midi < 60 ? "bass" : "treble") } : null} selection={selection}
      playbackFrame={props.globalPlaybackFrame ?? 0} getPlaybackFrame={props.getGlobalPlaybackFrame} playing={Boolean(props.globalPlaybackIsPlaying)}
      showBarNumbers={props.showBarNumbers !== false}
      transformPitch={(midi) => entryPitch(accidental === null ? midi : Math.max(0, Math.min(127, midiAtStep(notationPitch(midi, score.key).step) + accidental)))}
      onPoint={(point) => {
        focus(); props.onGlobalPlaybackFrameChange?.(point.frame);
        if (practiceMode) { props.onPracticeNotePlay?.(point.frame); return; }
        if (readOnly) return;
        clearBars();
        setCursor(point);
        if (write) { if (restMode) rest(point.frame, point.staff); else add(point.midi, point.frame, point.staff); setCursor({ ...point, frame: point.frame + entryLength }); }
        else setSelection({ noteIds: [], chordIds: [] });
      }}
      onSelect={(source, shift) => {
        focus(); props.onGlobalPlaybackFrameChange?.(source.start);
        if (practiceMode) { props.onPracticeNotePlay?.(source.start); return; }
        clearBars();
        setWrite(false); setVoice(source.voice ?? 1);
        setCursor({ frame: source.start + source.length, midi: source.midi, staff: source.staff });
        void audition(source.midi);
        setSelection((current) => {
          const selected = source.noteId !== undefined ? current.noteIds.includes(source.noteId) : current.chordIds.includes(source.chordId!);
          return source.noteId !== undefined
            ? { noteIds: shift ? selected ? current.noteIds.filter((id) => id !== source.noteId) : [...current.noteIds, source.noteId!] : [source.noteId], chordIds: shift ? current.chordIds : [] }
            : { noteIds: shift ? current.noteIds : [], chordIds: shift ? selected ? current.chordIds.filter((id) => id !== source.chordId) : [...current.chordIds, source.chordId!] : [source.chordId!] };
        });
      }}
      onAudition={(midi) => { void audition(midi); }}
      onBoxSelect={(sources, additive) => {
        if (readOnly) return;
        focus(); clearBars(); setWrite(false); setCursor(null);
        const noteIds = sources.flatMap((source) => source.noteId !== undefined ? [source.noteId] : []);
        const chordIds = sources.flatMap((source) => source.chordId !== undefined ? [source.chordId] : []);
        setSelection((current) => ({ noteIds: [...new Set([...(additive ? current.noteIds : []), ...noteIds])],
          chordIds: [...new Set([...(additive ? current.chordIds : []), ...chordIds])] }));
      }}
      onAddBar={readOnly ? undefined : () => commit({ ...snapshotRef.current, totalFrames: barCount * framesPerBar + framesPerBar })}
      onMove={(sources, shift, transpose) => {
        const chosen = { noteIds: [...new Set(sources.flatMap((source) => source.noteId !== undefined ? [source.noteId] : []))],
          chordIds: [...new Set(sources.flatMap((source) => source.chordId !== undefined ? [source.chordId] : []))] };
        commit(editScoreSelection(snapshotRef.current, chosen, { shift, transpose }));
      }} />
    </div>
    {barMenu && !readOnly && <div ref={barMenuRef} role="menu" aria-label={t("Bar actions")} data-notation-bar-menu="true" data-gte-editor-control="true" data-gte-floating-ui="true"
      className="fixed z-[180] w-40 rounded-xl border border-slate-200 bg-white py-1 text-sm shadow-lg"
      onKeyDown={event => {
        if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
        event.preventDefault(); event.stopPropagation();
        const buttons = Array.from(barMenuRef.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? []);
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
        buttons[(index + (event.key === "ArrowDown" ? 1 : buttons.length - 1)) % buttons.length]?.focus();
      }}
      style={{ left: Math.max(8, Math.min(barMenu.x, window.innerWidth - 168)), top: Math.max(8, Math.min(barMenu.y, window.innerHeight - 132)) }}>
      <button type="button" role="menuitem" className="block w-full px-3 py-2 text-left text-slate-700 hover:bg-slate-100 disabled:text-slate-400" disabled={!selectedBars.length || !props.onRequestSelectedBarsCopy} onClick={copyBars}>{t("Copy bars")}</button>
      <button type="button" role="menuitem" className="block w-full px-3 py-2 text-left text-slate-700 hover:bg-slate-100 disabled:text-slate-400" disabled={!props.barClipboardAvailable || !props.onRequestSelectedBarsPaste} onClick={() => pasteBars(barMenu.insertIndex)}>{t("Paste bars")}</button>
      <button type="button" role="menuitem" className="block w-full px-3 py-2 text-left text-rose-600 hover:bg-rose-50 disabled:text-slate-400" disabled={!selectedBars.length || !props.onRequestSelectedBarsDelete} onClick={deleteBars}>{t("Delete bars")}</button>
    </div>}
  </div>;
}
