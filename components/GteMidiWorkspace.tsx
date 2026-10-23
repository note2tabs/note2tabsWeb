import { memo, useEffect, useMemo, useRef, useState, type ComponentProps, type PointerEvent as ReactPointerEvent } from "react";
import type GteWorkspace from "./GteWorkspace";
import { addScoreNote, scoreEvents, snapScorePitch, type ScoreEvent } from "../lib/gteNotation";
import { editMidiEvents, midiGridFrames, midiPitchName, pasteMidiEvents, snapMidiFrame, type MidiEdit } from "../lib/gteMidi";
import { prepareTrackInstrument, schedulePreparedTrackNote } from "../lib/gteSamplePlayback";
import { useLocale } from "../lib/i18n/react";

type Props = ComponentProps<typeof GteWorkspace>;
const KEY_WIDTH = 60, ROW = 18, PITCH_HEIGHT = 128 * ROW, VELOCITY_HEIGHT = 72;
const black = (pitch: number) => [1, 3, 6, 8, 10].includes(pitch % 12);
type Point = { x: number; y: number; frame: number; midi: number };
type Gesture = { kind: "move" | "left" | "right" | "box" | "draw" | "velocity"; start: Point; keys: string[]; base: Props["snapshot"]; additive: boolean; midi?: number };

const MidiPlayhead = memo(function MidiPlayhead({ scale, height, frame, playing, getFrame }: {
  scale: number; height: number; frame: number; playing: boolean; getFrame?: () => number;
}) {
  const ref = useRef<SVGLineElement>(null);
  useEffect(() => {
    let raf = 0;
    const update = () => {
      const x = Math.max(0, getFrame?.() ?? frame) * scale;
      ref.current?.setAttribute("x1", String(x)); ref.current?.setAttribute("x2", String(x));
      if (playing) raf = requestAnimationFrame(update);
    };
    update(); return () => cancelAnimationFrame(raf);
  }, [scale, frame, playing, getFrame]);
  return <line ref={ref} y1={0} y2={height} stroke="#d6556b" strokeWidth={1.5} pointerEvents="none" data-midi-playhead="true" />;
});

export default function GteMidiWorkspace(props: Props) {
  const { t } = useLocale();
  const { snapshot, editMenuDisabled: disabled = false } = props;
  const [mode, setMode] = useState<"select" | "draw">("select");
  const [selection, setSelection] = useState<string[]>([]), [grid, setGrid] = useState(16), [snap, setSnap] = useState(true);
  const [zoom, setZoom] = useState(240), [voice, setVoice] = useState<1 | 2>(1);
  const [preview, setPreview] = useState<MidiEdit | null>(null), [marquee, setMarquee] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [drawing, setDrawing] = useState<{ frame: number; midi: number; length: number } | null>(null);
  const [viewport, setViewport] = useState({ left: 0, top: 0, width: 1000, height: 480 });
  const root = useRef<HTMLDivElement>(null), scroller = useRef<HTMLDivElement>(null), surface = useRef<SVGSVGElement>(null);
  const gesture = useRef<Gesture | null>(null), clipboard = useRef<ScoreEvent[]>([]), cursor = useRef(0);
  const scrollRaf = useRef(0), pointer = useRef<{ clientX: number; clientY: number; altKey: boolean } | null>(null);
  const moveAt = useRef<(event: { clientX: number; clientY: number; altKey: boolean }) => void>(() => undefined);
  const snapshotRef = useRef(snapshot); snapshotRef.current = snapshot;
  const audio = useRef<AudioContext | null>(null), auditionVersion = useRef(0), lastAudition = useRef(-1);
  const framesPerBar = snapshot.framesPerMessure || 480, step = midiGridFrames(snapshot, grid), scale = zoom / framesPerBar;
  const events = useMemo(() => scoreEvents(snapshot), [snapshot]);
  const chosen = useMemo(() => new Set(selection), [selection]);
  const bars = Math.max(4, Math.ceil(Math.max(snapshot.totalFrames, props.globalPlaybackTimelineEnd ?? 0) / framesPerBar) + 1);
  const width = Math.max(viewport.width - KEY_WIDTH, bars * zoom);
  const visible = useMemo(() => events.filter((event) => event.start * scale < viewport.left + viewport.width && (event.start + event.length) * scale > viewport.left - KEY_WIDTH &&
    (127 - event.midi) * ROW < viewport.top + viewport.height && (128 - event.midi) * ROW > viewport.top - 32), [events, scale, viewport]);
  const selected = useMemo(() => events.filter((event) => chosen.has(event.key)), [events, chosen]);
  const focus = () => { props.onFocusWorkspace?.(); root.current?.focus({ preventScroll: true }); };
  const commit = (next: typeof snapshot) => { if (!disabled && next !== snapshotRef.current) { snapshotRef.current = next; props.onSnapshotChange(next); } };
  const audition = async (midi: number) => {
    if (snapshot.playbackMuted || props.globalPlaybackIsPlaying) return;
    const version = ++auditionVersion.current;
    try {
      const ctx = audio.current ?? new AudioContext(); audio.current = ctx; await ctx.resume();
      const instrument = await prepareTrackInstrument(ctx, snapshot.instrumentId);
      if (version !== auditionVersion.current || ctx.state !== "running") return;
      schedulePreparedTrackNote({ ctx, destination: ctx.destination, instrument, midi, gain: 0.35 * (snapshot.playbackVolume ?? 1) * (props.globalPlaybackVolume ?? 1), startTime: ctx.currentTime, duration: 0.22 });
    } catch { /* Editing remains available when audio is unavailable. */ }
  };
  useEffect(() => () => { auditionVersion.current++; void audio.current?.close().catch(() => undefined); }, []);
  useEffect(() => {
    const element = scroller.current; if (!element) return;
    const update = () => setViewport({ left: element.scrollLeft, top: element.scrollTop, width: element.clientWidth, height: element.clientHeight });
    element.scrollTop = Math.max(0, (127 - (events.length ? Math.max(...events.map((event) => event.midi)) + 5 : 77)) * ROW);
    update(); const observer = new ResizeObserver(update); observer.observe(element);
    return () => observer.disconnect();
    // Initial register only; edits must not jump the user's viewport.
  }, [props.editorId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    props.onSelectionStateChange?.({ noteIds: selected.flatMap((event) => event.noteId !== undefined ? [event.noteId] : []),
      chordIds: [...new Set(selected.flatMap((event) => event.chordId !== undefined ? [event.chordId] : []))],
      noteCount: selected.filter((event) => event.noteId !== undefined).length, chordCount: new Set(selected.flatMap((event) => event.chordId !== undefined ? [event.chordId] : [])).size });
  }, [selected, props.onSelectionStateChange]);
  useEffect(() => { setSelection([]); }, [props.editorId, props.selectionClearEpoch]);
  const clearGesture = () => { gesture.current = null; pointer.current = null; cancelAnimationFrame(scrollRaf.current); setPreview(null); setDrawing(null); setMarquee(null); };
  useEffect(() => () => cancelAnimationFrame(scrollRaf.current), []);
  useEffect(() => { clearGesture(); }, [snapshot, disabled]);
  const point = (event: { clientX: number; clientY: number }): Point => {
    const bounds = surface.current!.getBoundingClientRect();
    const x = event.clientX - bounds.left, y = event.clientY - bounds.top;
    return { x, y, frame: Math.max(0, x / scale), midi: Math.max(0, Math.min(127, 127 - Math.floor(y / ROW))) };
  };
  const quantize = (frame: number, alt = false) => snap && !alt ? snapMidiFrame(frame, step) : Math.max(0, frame);
  const insert = (frame: number, midi: number, length = step, chromatic = false) => {
    if (disabled) return;
    const pitch = props.globalSnapToKeyEnabled && !chromatic ? snapScorePitch(midi, props.canvasKeyBase, props.canvasKeyType) : midi;
    const result = addScoreNote(snapshotRef.current, pitch, frame, length, pitch < 60 ? "bass" : "treble", voice);
    result.note.velocity = 100 / 127; commit(result.snapshot); setSelection(["n:" + result.note.id]); void audition(pitch);
  };
  const applyEdit = (keys: string[], change: MidiEdit) => {
    const before = snapshotRef.current, sources = scoreEvents(before).filter((event) => keys.includes(event.key));
    const next = editMidiEvents(before, keys, change); if (next === before) return; commit(next);
    if (change.remove) { setSelection([]); return; }
    // Imported chord members become individually editable notes after an edit.
    const after = scoreEvents(next), used = new Set<string>();
    setSelection(sources.flatMap((source) => {
      const matches = (event: ScoreEvent) => !used.has(event.key) && event.midi === source.midi + (change.transpose ?? 0) && event.start === source.start + (change.shift ?? 0) && event.length === source.length + (change.lengthDelta ?? 0) && (event.voice ?? 1) === (change.voice ?? source.voice ?? 1);
      const match = after.find((event) => event.key === source.key && matches(event)) ?? after.find((event) => matches(event) && !before.notes.some((note) => event.noteId === note.id));
      if (!match) return []; used.add(match.key); return [match.key];
    }));
  };
  const capture = (event: ReactPointerEvent, kind: Gesture["kind"], keys: string[]) => {
    event.preventDefault(); event.stopPropagation(); focus();
    const start = point(event); gesture.current = { kind, keys, start, base: snapshotRef.current, additive: event.shiftKey };
    surface.current?.setPointerCapture(event.pointerId);
    pointer.current = { clientX: event.clientX, clientY: event.clientY, altKey: event.altKey };
    cancelAnimationFrame(scrollRaf.current);
    const autoScroll = () => {
      const element = scroller.current, p = pointer.current;
      if (!gesture.current || !element || !p) return;
      const bounds = element.getBoundingClientRect();
      const dx = p.clientX > bounds.right - 24 ? 12 : p.clientX < bounds.left + KEY_WIDTH + 12 ? -12 : 0;
      const dy = p.clientY > bounds.bottom - 24 ? 12 : p.clientY < bounds.top + 36 ? -12 : 0;
      if (dx || dy) {
        const left = element.scrollLeft, top = element.scrollTop;
        element.scrollLeft += dx; element.scrollTop += dy;
        if (left !== element.scrollLeft || top !== element.scrollTop) moveAt.current(p);
      }
      scrollRaf.current = requestAnimationFrame(autoScroll);
    };
    scrollRaf.current = requestAnimationFrame(autoScroll);
  };
  const move = (event: { clientX: number; clientY: number; altKey: boolean }) => {
    pointer.current = { clientX: event.clientX, clientY: event.clientY, altKey: event.altKey };
    const active = gesture.current; if (!active || disabled) return;
    const current = point(event);
    if (active.kind === "box") { setMarquee({ x: Math.min(active.start.x, current.x), y: Math.min(active.start.y, current.y), width: Math.abs(current.x - active.start.x), height: Math.abs(current.y - active.start.y) }); return; }
    if (active.kind === "draw") {
      const start = quantize(active.start.frame, event.altKey);
      setDrawing({ frame: start, midi: active.start.midi, length: Math.max(step, quantize(current.frame, event.altKey) - start + step) }); return;
    }
    if (active.kind === "velocity") return;
    const targets = scoreEvents(active.base).filter((note) => active.keys.includes(note.key));
    if (!targets.length) return;
    const anchor = targets[0], raw = current.frame - active.start.frame;
    let shift = snap && !event.altKey ? Math.round(raw / step) * step : raw;
    const shortest = Math.min(...targets.map((note) => note.length)), earliest = Math.min(...targets.map((note) => note.start));
    if (active.kind === "left") shift = Math.max(-earliest, Math.min(shortest - (snap && !event.altKey ? step : 0.1), shift));
    else if (active.kind === "move") shift = Math.max(-earliest, shift);
    let transpose = current.midi - active.start.midi;
    transpose = Math.max(-Math.min(...targets.map((note) => note.midi)), Math.min(127 - Math.max(...targets.map((note) => note.midi)), transpose));
    const change: MidiEdit = active.kind === "left" ? { shift, lengthDelta: -shift } : active.kind === "right"
      ? { lengthDelta: Math.max((snap && !event.altKey ? step : 0.1) - shortest, shift) } : { shift, transpose };
    setPreview(change);
    if (active.kind === "move" && lastAudition.current !== anchor.midi + transpose) { lastAudition.current = anchor.midi + transpose; void audition(lastAudition.current); }
  };
  moveAt.current = move;
  const end = (event: ReactPointerEvent) => {
    const active = gesture.current; if (!active) return;
    if (!disabled && active.base === snapshotRef.current) {
      if (active.kind === "draw") insert(drawing?.frame ?? quantize(active.start.frame, event.altKey), drawing?.midi ?? active.start.midi, drawing?.length ?? step, event.altKey);
      else if (active.kind === "box") {
        const p = point(event), left = Math.min(active.start.x, p.x), right = Math.max(active.start.x, p.x), top = Math.min(active.start.y, p.y), bottom = Math.max(active.start.y, p.y);
        const keys = events.filter((note) => note.start * scale <= right && (note.start + note.length) * scale >= left && (127 - note.midi) * ROW <= bottom && (128 - note.midi) * ROW >= top).map((note) => note.key);
        setSelection(active.additive ? [...new Set([...active.keys, ...keys])] : keys);
      } else if (preview) { applyEdit(active.keys, preview); if (active.kind === "move") { const note = events.find((note) => active.keys.includes(note.key)); if (note) void audition(note.midi + (preview.transpose ?? 0)); } }
    }
    clearGesture();
  };
  const clipboardAction = (cut = false) => { clipboard.current = selected.map((event) => ({ ...event })); if (cut) applyEdit(selection, { remove: true }); };
  const paste = (frame: number) => { const result = pasteMidiEvents(snapshotRef.current, clipboard.current, frame); commit(result.snapshot); setSelection(result.keys); };
  const control = "h-8 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-40";
  return <div ref={root} tabIndex={0} data-gte-midi-editor="true" className="min-w-0 w-full pb-36 outline-none" onFocus={() => props.onFocusWorkspace?.()}
    onKeyDown={(event) => {
      if ((event.target as HTMLElement).closest("input,select,textarea") || disabled) return;
      const key = event.key.toLowerCase(), mod = event.ctrlKey || event.metaKey;
      if (mod && key === "z") { event.preventDefault(); event.stopPropagation(); if (event.shiftKey) props.onRequestRedo?.(); else props.onRequestUndo?.(); }
      else if (mod && key === "y") { event.preventDefault(); event.stopPropagation(); props.onRequestRedo?.(); }
      else if (mod && key === "a") { event.preventDefault(); event.stopPropagation(); setSelection(events.map((note) => note.key)); }
      else if (mod && (key === "c" || key === "x")) { event.preventDefault(); event.stopPropagation(); clipboardAction(key === "x"); }
      else if (mod && key === "v") { event.preventDefault(); event.stopPropagation(); paste(cursor.current); }
      else if (mod && key === "d") { event.preventDefault(); event.stopPropagation(); clipboardAction(); paste(Math.max(...selected.map((note) => note.start + note.length), 0)); }
      else if (key === "escape") { event.stopPropagation(); clearGesture(); setSelection([]); setMode("select"); }
      else if (key === "delete" || key === "backspace") { event.preventDefault(); event.stopPropagation(); applyEdit(selection, { remove: true }); }
      else if (key.startsWith("arrow") && selection.length) { event.preventDefault(); event.stopPropagation(); applyEdit(selection,
        key === "arrowup" || key === "arrowdown" ? { transpose: (key === "arrowup" ? 1 : -1) * (event.shiftKey ? 12 : 1) } : { shift: (key === "arrowright" ? 1 : -1) * step }); }
      else if (key === "b" && !mod) { event.preventDefault(); setMode((value) => value === "draw" ? "select" : "draw"); }
      else if (key === " " && !(event.target as HTMLElement).closest("button")) { event.preventDefault(); event.stopPropagation(); props.onGlobalPlaybackToggle?.(); }
    }}>
    <div role="toolbar" aria-label={t("MIDI tools")} data-gte-floating-ui="true" className="mb-3 flex flex-wrap items-center gap-2 text-xs">
      <button type="button" className={control + (mode === "select" ? " !border-emerald-500 !bg-emerald-50" : "")} aria-pressed={mode === "select"} title={t("Select · Esc")} onClick={() => { setMode("select"); focus(); }}>{t("Select")}</button>
      <button type="button" className={control + (mode === "draw" ? " !border-emerald-500 !bg-emerald-50" : "")} aria-pressed={mode === "draw"} title={t("Draw · B")} disabled={disabled} onClick={() => { setMode("draw"); focus(); }}>{t("Draw")}</button>
      <label className="flex items-center gap-1 text-slate-500">{t("Grid")}<select aria-label={t("MIDI grid")} className={control} value={grid} onChange={(event) => setGrid(Number(event.target.value))}>{[1, 2, 4, 8, 16, 32, 64].map((value) => <option key={value} value={value}>1/{value}</option>)}</select></label>
      <button type="button" className={control + (snap ? " !bg-emerald-50" : "")} aria-pressed={snap} title={t("Snap · hold Alt to bypass")} onClick={() => setSnap(!snap)}>{t("Snap")}</button>
      <label className="flex items-center gap-1 text-slate-500">{t("Voice")}<select aria-label={t("MIDI voice")} className={control} value={selected[0]?.voice ?? voice} disabled={disabled} onChange={(event) => { const value = Number(event.target.value) as 1 | 2; setVoice(value); if (selection.length) applyEdit(selection, { voice: value }); }}><option value={1}>1</option><option value={2}>2</option></select></label>
      <label className="flex items-center gap-1 text-slate-500">{t("Zoom")}<input type="range" aria-label={t("MIDI zoom")} min={120} max={720} step={30} value={zoom} onChange={(event) => setZoom(Number(event.target.value))} className="w-24 accent-emerald-700" /></label>
      {selected.length > 0 && <label className="flex items-center gap-1 text-slate-500">{t("Velocity")}<input type="number" aria-label={t("Selected velocity")} min={1} max={127} className={control + " w-16"} value={Math.round((selected[0].velocity ?? 1) * 127)} disabled={disabled} onChange={(event) => { const value = Number(event.target.value); if (value >= 1 && value <= 127) applyEdit(selection, { velocity: value / 127 }); }} /></label>}
      <span className="ml-auto text-[10px] text-slate-500">{t("Double-click to add · drag edges to resize")}</span>
    </div>
    <div className="overflow-hidden rounded-lg border border-slate-300 bg-[#faf9f5]">
      <div ref={scroller} className="relative h-[min(56vh,520px)] min-h-64 overflow-auto overscroll-contain" onScroll={(event) => { const e = event.currentTarget; setViewport({ left: e.scrollLeft, top: e.scrollTop, width: e.clientWidth, height: e.clientHeight }); }}>
        <div style={{ width: width + KEY_WIDTH }}>
          <div className="sticky top-0 z-30 flex h-7 bg-[#eeede7]" style={{ width: width + KEY_WIDTH }}>
            <div className="sticky left-0 z-10 flex shrink-0 items-center justify-center border-r border-slate-300 bg-[#eeede7] text-[10px] text-slate-500" style={{ width: KEY_WIDTH }}>{t("Pitch")}</div>
            <svg width={width} height={28} role="slider" tabIndex={0} aria-label={t("MIDI playhead")} aria-valuemin={0} aria-valuemax={bars * framesPerBar} aria-valuenow={props.globalPlaybackFrame ?? 0}
              onPointerDown={(event) => { cursor.current = quantize((event.clientX - event.currentTarget.getBoundingClientRect().left) / scale, event.altKey); props.onGlobalPlaybackFrameChange?.(cursor.current); focus(); }}
              onKeyDown={(event) => { if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); event.stopPropagation(); cursor.current = Math.max(0, cursor.current + (event.key === "ArrowRight" ? step : -step)); props.onGlobalPlaybackFrameChange?.(cursor.current); } }}>
              {Array.from({ length: bars }, (_, index) => <g key={index}><line x1={index * zoom} x2={index * zoom} y1={0} y2={28} stroke="#9aa89f" /><text x={index * zoom + 6} y={17} fontSize={10} fill="#53645b">{index + 1}</text></g>)}
            </svg>
          </div>
          <div className="relative" style={{ height: PITCH_HEIGHT }}>
            <svg ref={surface} width={width} height={PITCH_HEIGHT} className="absolute select-none" style={{ left: KEY_WIDTH, touchAction: "none", cursor: mode === "draw" ? "crosshair" : "default" }} role="group" aria-label={t("MIDI piano roll")}
              onPointerDown={(event) => { if (event.button !== 0 || disabled) return; cursor.current = quantize(point(event).frame, event.altKey); props.onGlobalPlaybackFrameChange?.(cursor.current); capture(event, mode === "draw" ? "draw" : "box", event.shiftKey ? selection : []); if (mode === "select" && !event.shiftKey) setSelection([]); }}
              onPointerMove={move} onPointerUp={end} onPointerCancel={clearGesture} onLostPointerCapture={clearGesture}
              onDoubleClick={(event) => { if (mode === "select") { const p = point(event); insert(quantize(p.frame, event.altKey), p.midi, step, event.altKey); } }}>
              <defs><pattern id={"midi-grid-" + snapshot.id} width={step * scale} height={ROW} patternUnits="userSpaceOnUse"><path d={`M0 0H${step * scale}M0 0V${ROW}`} fill="none" stroke="#cdd5ce" strokeWidth={0.6} /></pattern></defs>
              {Array.from({ length: 128 }, (_, index) => <rect key={index} x={0} y={index * ROW} width={width} height={ROW} fill={black(127 - index) ? "#e9ece7" : "#fafbf8"} />)}
              <rect width={width} height={PITCH_HEIGHT} fill={`url(#midi-grid-${snapshot.id})`} />
              {Array.from({ length: bars * (snapshot.timeSignature || 4) }, (_, index) => <line key={index} x1={index * zoom / (snapshot.timeSignature || 4)} x2={index * zoom / (snapshot.timeSignature || 4)} y1={0} y2={PITCH_HEIGHT} stroke={index % (snapshot.timeSignature || 4) === 0 ? "#82958a" : "#c0cbc3"} strokeWidth={index % (snapshot.timeSignature || 4) === 0 ? 1.2 : 0.65} />)}
              {visible.map((note) => {
                const edit = chosen.has(note.key) ? preview : null;
                const x = (note.start + (edit?.shift ?? 0)) * scale, y = (127 - note.midi - (edit?.transpose ?? 0)) * ROW + 2, w = Math.max(3, (note.length + (edit?.lengthDelta ?? 0)) * scale);
                const begin = (event: ReactPointerEvent, kind: Gesture["kind"]) => {
                  if (disabled || event.button !== 0) return; event.stopPropagation();
                  if (event.shiftKey) { setSelection(chosen.has(note.key) ? selection.filter((key) => key !== note.key) : [...selection, note.key]); return; }
                  const keys = chosen.has(note.key) ? selection : [note.key]; setSelection(keys); capture(event, kind, keys); lastAudition.current = note.midi; void audition(note.midi);
                };
                return <g key={note.key} data-midi-note={note.key} role="button" tabIndex={0} aria-label={`${midiPitchName(note.midi)} · ${t("Velocity")} ${Math.round(note.velocity * 127)}`} aria-pressed={chosen.has(note.key)}
                  onDoubleClick={(event) => event.stopPropagation()} onContextMenu={(event) => { event.preventDefault(); if (!disabled && mode === "draw") applyEdit([note.key], { remove: true }); }}
                  onKeyDown={(event) => { if (event.key === "Enter") { event.stopPropagation(); setSelection([note.key]); void audition(note.midi); } }}>
                  <rect x={x} y={y} width={w} height={ROW - 4} rx={2} fill={chosen.has(note.key) ? "#86dec0" : "#2bb88b"} fillOpacity={0.55 + note.velocity * 0.45} stroke={chosen.has(note.key) ? "#175a43" : "#26886b"} strokeWidth={chosen.has(note.key) ? 1.4 : 0.6} onPointerDown={(event) => begin(event, "move")} />
                  {w > 30 && <text x={x + 5} y={y + 10} fontSize={9} fill="#123d2d" pointerEvents="none">{midiPitchName(note.midi)}</text>}
                  <rect x={x} y={y} width={Math.min(6, w / 3)} height={ROW - 4} fill="transparent" cursor="ew-resize" onPointerDown={(event) => begin(event, "left")} />
                  <rect x={x + w - Math.min(6, w / 3)} y={y} width={Math.min(6, w / 3)} height={ROW - 4} fill="transparent" cursor="ew-resize" onPointerDown={(event) => begin(event, "right")} />
                </g>;
              })}
              {drawing && <rect x={drawing.frame * scale} y={(127 - drawing.midi) * ROW + 2} width={drawing.length * scale} height={ROW - 4} rx={2} fill="#86dec0" stroke="#175a43" pointerEvents="none" />}
              {marquee && <rect {...marquee} fill="#059669" fillOpacity={0.1} stroke="#059669" pointerEvents="none" />}
              <MidiPlayhead scale={scale} height={PITCH_HEIGHT} frame={props.globalPlaybackFrame ?? 0} playing={Boolean(props.globalPlaybackIsPlaying)} getFrame={props.getGlobalPlaybackFrame} />
            </svg>
            <div className="sticky left-0 z-20 border-r border-slate-400" style={{ width: KEY_WIDTH }}>
              {Array.from({ length: 128 }, (_, index) => { const midi = 127 - index; return <button key={midi} type="button" aria-label={t("Audition") + " " + midiPitchName(midi)} className={`block w-full border-b text-right pr-2 text-[9px] ${black(midi) ? "border-[#23352c] bg-[#35483d] text-white/70" : "border-slate-300 bg-[#fffef9] text-slate-500"}`} style={{ height: ROW }} onClick={() => { void audition(midi); focus(); }}>{midi % 12 === 0 ? midiPitchName(midi) : black(midi) ? "" : midiPitchName(midi).replace(/-?\d+$/, "")}</button>; })}
            </div>
          </div>
        </div>
      </div>
      <div className="relative overflow-hidden border-t border-slate-300 bg-[#f1f2ec]" style={{ height: VELOCITY_HEIGHT }}>
        <div className="absolute inset-y-0 left-0 z-10 flex items-center border-r border-slate-300 bg-[#eeede7] px-1 text-[9px] text-slate-500" style={{ width: KEY_WIDTH }}>{t("Velocity")}</div>
        <svg width={width} height={VELOCITY_HEIGHT} style={{ marginLeft: KEY_WIDTH, transform: `translateX(-${viewport.left}px)`, touchAction: "none" }} aria-label={t("MIDI velocity lane")}
          onPointerMove={(event) => { const active = gesture.current; if (active?.kind !== "velocity") return; const bounds = event.currentTarget.getBoundingClientRect(); setPreview({ velocity: Math.max(1 / 127, Math.min(1, 1 - (event.clientY - bounds.top - 6) / (VELOCITY_HEIGHT - 12))) }); }}
          onPointerUp={(event) => { const active = gesture.current; if (active?.kind === "velocity" && active.base === snapshotRef.current && preview) applyEdit(active.keys, preview); clearGesture(); event.currentTarget.releasePointerCapture?.(event.pointerId); }} onPointerCancel={clearGesture} onLostPointerCapture={clearGesture}>
          {events.filter((note) => note.start * scale >= viewport.left - KEY_WIDTH && note.start * scale < viewport.left + viewport.width).map((note) => {
            const velocity = chosen.has(note.key) ? preview?.velocity ?? note.velocity : note.velocity, x = note.start * scale + 3, y = 6 + (1 - velocity) * (VELOCITY_HEIGHT - 12);
            return <g key={note.key} aria-label={`${midiPitchName(note.midi)} ${t("Velocity")} ${Math.round(velocity * 127)}`}>
              <line x1={x} x2={x} y1={VELOCITY_HEIGHT - 5} y2={y} stroke={chosen.has(note.key) ? "#175a43" : "#6ba38a"} strokeWidth={3} />
              <circle cx={x} cy={y} r={4} fill={chosen.has(note.key) ? "#175a43" : "#6ba38a"} cursor="ns-resize" onPointerDown={(event) => { if (disabled) return; event.preventDefault(); focus(); const keys = chosen.has(note.key) ? selection : [note.key]; setSelection(keys); gesture.current = { kind: "velocity", keys, start: point(event), base: snapshotRef.current, additive: false }; event.currentTarget.ownerSVGElement?.setPointerCapture(event.pointerId); }} />
            </g>;
          })}
        </svg>
      </div>
    </div>
  </div>;
}
