import { memo, useEffect, useMemo, useRef, useState, type ComponentProps, type PointerEvent as ReactPointerEvent } from "react";
import type GteWorkspace from "./GteWorkspace";
import { addScoreNote, scoreEvents, snapScorePitch, type ScoreEvent } from "../lib/gteNotation";
import { editMidiEvents, midiFitPlan, midiGridFrames, midiPitchName, midiPosition, pasteMidiEvents, snapMidiFrame, type MidiEdit } from "../lib/gteMidi";
import { readPitchedViewState, savePitchedViewState } from "../lib/gtePitchedViewState";
import GteMidiToolbar from "./GteMidiToolbar";
import { prepareTrackInstrument, schedulePreparedTrackNote } from "../lib/gteSamplePlayback";
import { useLocale } from "../lib/i18n/react";

type Props = ComponentProps<typeof GteWorkspace>;
const KEY_WIDTH = 76;
const black = (pitch: number) => [1, 3, 6, 8, 10].includes(pitch % 12);
type Point = { x: number; y: number; frame: number; midi: number };
type Gesture = { kind: "move" | "left" | "right" | "box" | "draw" | "velocity"; start: Point; keys: string[]; base: Props["snapshot"]; additive: boolean; midi?: number; targets?: ScoreEvent[] };

export const MidiPlayhead = memo(function MidiPlayhead({ scale, height, row, frame, playing, getFrame, notes, scroll, follow }: {
  scale: number; height: number; row: number; frame: number; playing: boolean; getFrame?: () => number;
  notes: readonly ScoreEvent[]; scroll: React.RefObject<HTMLDivElement | null>; follow: boolean;
}) {
  const ref = useRef<SVGLineElement>(null), highlights = useRef<SVGGElement>(null);
  useEffect(() => {
    let raf = 0, last: string | null = null;
    const update = () => {
      const current = Math.max(0, getFrame?.() ?? frame), x = current * scale;
      ref.current?.setAttribute("x1", String(x)); ref.current?.setAttribute("x2", String(x));
      const active = playing ? notes.filter((note) => note.start <= current && note.start + note.length > current) : [];
      const signature = active.map((note) => note.key).join("|");
      if (last !== signature) {
        last = signature;
        highlights.current?.replaceChildren(...active.map((note) => {
          const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
          for (const [key, value] of Object.entries({ x: note.start * scale, y: (127 - note.midi) * row + 1, width: Math.max(3, note.length * scale), height: row - 2, rx: 2, fill: "#fffbd9", "fill-opacity": 0.4, stroke: "#9b8945", "stroke-width": 1.5 })) rect.setAttribute(key, String(value));
          return rect;
        }));
      }
      const view = scroll.current;
      if (playing && follow && view && (x < view.scrollLeft || x > view.scrollLeft + view.clientWidth - KEY_WIDTH - 32)) view.scrollLeft = Math.max(0, x - 48);
      if (playing) raf = requestAnimationFrame(update);
    };
    update(); return () => cancelAnimationFrame(raf);
  }, [scale, height, row, frame, playing, getFrame, notes, scroll, follow]);
  return <g pointerEvents="none"><g ref={highlights} data-midi-playing="true" /><line ref={ref} y1={0} y2={height} stroke="#d6556b" strokeWidth={1.5} data-midi-playhead="true" /></g>;
});

export default function GteMidiWorkspace(props: Props) {
  const { t } = useLocale();
  const { snapshot, editMenuDisabled: disabled = false } = props;
  const [saved] = useState(() => readPitchedViewState(props.editorId));
  const [mode, setMode] = useState<"select" | "draw">(saved.mode ?? "select");
  const [selection, setSelection] = useState<string[]>(saved.selection ?? []), [grid, setGrid] = useState(saved.grid ?? 16);
  const snap = true, strength = 1;
  const [zoom, setZoom] = useState(saved.zoom ?? 240), [voice, setVoice] = useState<1 | 2>(1), [row, setRow] = useState(saved.row ?? 18);
  const [triplet, setTriplet] = useState(saved.triplet ?? false);
  const [velocityHeight, setVelocityHeight] = useState(saved.velocityHeight ?? 100), [follow, setFollow] = useState(saved.follow ?? false);
  const [showNoteLabels, setShowNoteLabels] = useState(saved.showNoteLabels ?? true);
  const [workspaceHeight, setWorkspaceHeight] = useState(480);
  const lastVelocityHeight = useRef(velocityHeight || 100);
  const [auditionDrag, setAuditionDrag] = useState(true), [hoverPitch, setHoverPitch] = useState<number | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; frame: number; midi: number } | null>(null), [velocityScale, setVelocityScale] = useState(100);
  const [loopPreview, setLoopPreview] = useState<{ startFrame: number; endFrame: number } | null>(null);
  const rulerGesture = useRef<{ x: number; frame: number } | null>(null);
  useEffect(() => {
    if (!menu) return;
    const outside = (event: PointerEvent) => { if (!(event.target as Element).closest?.('[role="menu"]')) setMenu(null); };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [menu]);
  const [preview, setPreview] = useState<MidiEdit | null>(null), [marquee, setMarquee] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [drawing, setDrawing] = useState<{ frame: number; midi: number; length: number } | null>(null);
  const [viewport, setViewport] = useState({ left: 0, top: 0, width: 1000, height: 480 });
  const root = useRef<HTMLDivElement>(null), scroller = useRef<HTMLDivElement>(null), surface = useRef<SVGSVGElement>(null);
  const gesture = useRef<Gesture | null>(null), clipboard = useRef<ScoreEvent[]>([]), cursor = useRef(0);
  const scrollRaf = useRef(0), pointer = useRef<{ clientX: number; clientY: number; altKey: boolean } | null>(null);
  const moveAt = useRef<(event: { clientX: number; clientY: number; altKey: boolean }) => void>(() => undefined);
  const snapshotRef = useRef(snapshot); snapshotRef.current = snapshot;
  const velocityResizeCleanup = useRef<() => void>(() => undefined);
  useEffect(() => () => velocityResizeCleanup.current(), []);
  useEffect(() => {
    const update = () => { if (root.current) setWorkspaceHeight(Math.max(320, window.innerHeight - Math.max(0, root.current.getBoundingClientRect().top) - 104)); };
    update();
    const banner = document.querySelector(".gte-editor-sticky-banner"), observer = new ResizeObserver(update);
    if (banner) observer.observe(banner);
    window.addEventListener("resize", update); window.addEventListener("scroll", update, { passive: true });
    return () => { observer.disconnect(); window.removeEventListener("resize", update); window.removeEventListener("scroll", update); };
  }, []);
  const audio = useRef<AudioContext | null>(null), auditionVersion = useRef(0), lastAudition = useRef(-1);
  const framesPerBar = snapshot.framesPerMessure || 480, step = midiGridFrames(snapshot, grid, triplet), scale = zoom / framesPerBar;
  const ROW = row, PITCH_HEIGHT = 128 * row, VELOCITY_HEIGHT = Math.min(velocityHeight, workspaceHeight - 220);
  const interacted = useRef(false), positioned = useRef(false), restoreScroll = useRef<{ left: number; top: number } | null>(null);
  const events = useMemo(() => scoreEvents(snapshot), [snapshot]);
  const chosen = useMemo(() => new Set(selection), [selection]);
  const contentEnd = events.reduce((end, note) => Math.max(end, note.start + note.length), 0);
  const bars = Math.max(4, Math.ceil((contentEnd || snapshot.totalFrames) / framesPerBar) + 1);
  const width = Math.max(viewport.width - KEY_WIDTH, bars * zoom);
  const meter = snapshot.timeSignature || 4;
  const rulerStride = Math.max(1, 2 ** Math.ceil(Math.log2(48 / zoom)));
  const beatStride = zoom / meter >= 12 ? 1 : zoom >= 12 ? meter : meter * 2 ** Math.ceil(Math.log2(12 / zoom));
  const patternWidth = step * scale * 2 ** Math.max(0, Math.ceil(Math.log2(8 / (step * scale))));
  const visible = useMemo(() => events.filter((event) => event.start * scale < viewport.left + viewport.width && (event.start + event.length) * scale > viewport.left - KEY_WIDTH &&
    (127 - event.midi) * ROW < viewport.top + viewport.height && (128 - event.midi) * ROW > viewport.top - 32), [events, scale, viewport, ROW]);
  const selected = useMemo(() => events.filter((event) => chosen.has(event.key)), [events, chosen]);
  const velocityEvents = useMemo(() => events.filter((note) => note.start * scale >= viewport.left - KEY_WIDTH && note.start * scale < viewport.left + viewport.width), [events, scale, viewport.left, viewport.width]);
  const velocityPaths = useMemo(() => {
    if (velocityEvents.length <= 1500 || !VELOCITY_HEIGHT) return [];
    const paths = ["", "", ""];
    for (const note of velocityEvents) {
      const value = chosen.has(note.key) ? preview?.velocity ?? note.velocity : note.velocity;
      const x = (note.start * scale + 3).toFixed(2), y = (6 + (1 - value) * (VELOCITY_HEIGHT - 12)).toFixed(2);
      paths[chosen.has(note.key) ? 2 : note.voice === 2 ? 1 : 0] += `M${x} ${VELOCITY_HEIGHT - 5}V${y}`;
    }
    return paths;
  }, [velocityEvents, VELOCITY_HEIGHT, chosen, preview?.velocity, scale]);
  const dense = visible.length > 1500;
  // At overview zoom render every note in three batched paths instead of
  // thousands of DOM nodes. Picking and box selection still use real events.
  const densityPaths = useMemo(() => {
    if (!dense) return [];
    const paths = ["", "", ""];
    for (const note of visible) {
      const edit = chosen.has(note.key) ? preview : null;
      const pitch = edit?.key ? snapScorePitch(note.midi + (edit.transpose ?? 0), edit.key.root, edit.key.type) : note.midi + (edit?.transpose ?? 0);
      const x = ((note.start + (edit?.shift ?? 0)) * scale).toFixed(2), y = ((127 - pitch) * ROW + 1).toFixed(2);
      const w = Math.max(1, (note.length + (edit?.lengthDelta ?? 0)) * scale).toFixed(2), h = Math.max(4, ROW - 2);
      paths[chosen.has(note.key) ? 2 : note.voice === 2 ? 1 : 0] += `M${x} ${y}h${w}v${h}h-${w}z`;
    }
    return paths;
  }, [dense, visible, chosen, preview, scale, ROW]);
  const focus = () => { interacted.current = true; props.onFocusWorkspace?.(); root.current?.focus({ preventScroll: true }); };
  const fit = (notes: readonly ScoreEvent[] = events) => {
    const element = scroller.current; if (!element) return;
    const plan = midiFitPlan(notes, framesPerBar, element.clientWidth - KEY_WIDTH, element.clientHeight - 28);
    restoreScroll.current = plan; setZoom(plan.zoom); setRow(plan.row);
    setViewport((previous) => ({ ...previous, left: plan.left, top: plan.top }));
    requestAnimationFrame(() => { if (scroller.current) { scroller.current.scrollLeft = plan.left; scroller.current.scrollTop = plan.top; } });
  };
  const centerPlayback = () => { if (scroller.current) scroller.current.scrollLeft = Math.max(0, (props.getGlobalPlaybackFrame?.() ?? props.globalPlaybackFrame ?? 0) * scale - scroller.current.clientWidth / 2); };
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
    if (saved.left !== undefined) { element.scrollLeft = saved.left; element.scrollTop = saved.top ?? 0; positioned.current = true; }
    else if (events.length) { fit(events); positioned.current = true; }
    else element.scrollTop = (127 - 77) * ROW;
    update(); const observer = new ResizeObserver(update); observer.observe(element);
    return () => observer.disconnect();
    // Initial register only; edits must not jump the user's viewport.
  }, [props.editorId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!positioned.current && !interacted.current && events.length) { fit(events); positioned.current = true; }
  }, [events]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const target = restoreScroll.current;
    if (target && scroller.current) { scroller.current.scrollLeft = target.left; scroller.current.scrollTop = target.top; restoreScroll.current = null;
      setViewport({ left: scroller.current.scrollLeft, top: scroller.current.scrollTop, width: scroller.current.clientWidth, height: scroller.current.clientHeight }); }
  }, [zoom, row]);
  const viewState = useRef({ zoom, row, ...viewport, selection, grid, triplet, strength, snap, mode, velocityHeight, follow, showNoteLabels });
  viewState.current = { zoom, row, ...viewport, selection, grid, triplet, strength, snap, mode, velocityHeight, follow, showNoteLabels };
  useEffect(() => () => { savePitchedViewState(props.editorId, viewState.current); }, [props.editorId]);
  useEffect(() => { savePitchedViewState(props.editorId, { selection }); }, [props.editorId, selection]);
  const clearEpoch = useRef(props.selectionClearEpoch);
  useEffect(() => {
    props.onSelectionStateChange?.({ noteIds: selected.flatMap((event) => event.noteId !== undefined ? [event.noteId] : []),
      chordIds: [...new Set(selected.flatMap((event) => event.chordId !== undefined ? [event.chordId] : []))],
      noteCount: selected.filter((event) => event.noteId !== undefined).length, chordCount: new Set(selected.flatMap((event) => event.chordId !== undefined ? [event.chordId] : [])).size });
  }, [selected, props.onSelectionStateChange]);
  useEffect(() => { if (clearEpoch.current !== props.selectionClearEpoch) { setSelection([]); clearEpoch.current = props.selectionClearEpoch; } }, [props.selectionClearEpoch]);
  const clearGesture = () => { gesture.current = null; pointer.current = null; cancelAnimationFrame(scrollRaf.current); setPreview(null); setDrawing(null); setMarquee(null); };
  useEffect(() => () => cancelAnimationFrame(scrollRaf.current), []);
  useEffect(() => { clearGesture(); }, [snapshot, disabled]);
  const point = (event: { clientX: number; clientY: number }): Point => {
    const bounds = surface.current!.getBoundingClientRect();
    const x = event.clientX - bounds.left, y = event.clientY - bounds.top;
    return { x, y, frame: Math.max(0, x / scale), midi: Math.max(0, Math.min(127, 127 - Math.floor(y / ROW))) };
  };
  const quantize = (frame: number, _alt = false) => snapMidiFrame(frame, step);
  const insert = (frame: number, midi: number, length = step, chromatic = false) => {
    if (disabled) return;
    frame = quantize(frame); length = Math.max(step, quantize(length));
    const pitch = props.globalSnapToKeyEnabled && !chromatic ? snapScorePitch(midi, props.canvasKeyBase, props.canvasKeyType) : midi;
    const result = addScoreNote(snapshotRef.current, pitch, frame, length, pitch < 60 ? "bass" : "treble", voice);
    result.note.velocity = 100 / 127; commit(result.snapshot); setSelection(["n:" + result.note.id]); void audition(pitch);
  };
  const applyEdit = (keys: string[], change: MidiEdit) => {
    const keySet = new Set(keys), before = snapshotRef.current, sources = scoreEvents(before).filter((event) => keySet.has(event.key));
    const next = editMidiEvents(before, keys, change); if (next === before) return; commit(next);
    if (change.remove) { setSelection([]); return; }
    // Imported chord members become individually editable notes after an edit.
    const after = scoreEvents(next), used = new Set<string>(), byKey = new Map(after.map((event) => [event.key, event]));
    const oldNotes = new Set(before.notes.map((note) => note.id)), replacements = new Map<string, ScoreEvent[]>();
    const signature = (midi: number, start: number, length: number, voice: number) => `${midi}:${start}:${length}:${voice}`;
    for (const event of after) if (event.noteId !== undefined && !oldNotes.has(event.noteId)) {
      const key = signature(event.midi, event.start, event.length, event.voice ?? 1), list = replacements.get(key) ?? []; list.push(event); replacements.set(key, list);
    }
    setSelection(sources.flatMap((source) => {
      const pitch = change.key ? snapScorePitch(source.midi + (change.transpose ?? 0), change.key.root, change.key.type) : source.midi + (change.transpose ?? 0);
      const matches = (event: ScoreEvent) => !used.has(event.key) && event.midi === pitch && event.start === source.start + (change.shift ?? 0) && event.length === source.length + (change.lengthDelta ?? 0) && (event.voice ?? 1) === (change.voice ?? source.voice ?? 1);
      const original = byKey.get(source.key);
      const match = original && matches(original) ? original : replacements.get(signature(pitch, source.start + (change.shift ?? 0), source.length + (change.lengthDelta ?? 0), change.voice ?? source.voice ?? 1))?.find(matches);
      if (!match) return []; used.add(match.key); return [match.key];
    }));
  };
  const capture = (event: ReactPointerEvent, kind: Gesture["kind"], keys: string[]) => {
    event.preventDefault(); event.stopPropagation(); focus();
    const start = point(event), keySet = new Set(keys); gesture.current = { kind, keys, start, base: snapshotRef.current, additive: event.shiftKey, targets: events.filter((note) => keySet.has(note.key)) };
    if (kind === "draw") setDrawing({ frame: quantize(start.frame, event.altKey), midi: start.midi, length: step });
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
    const active = gesture.current;
    const p = point(event); setHoverPitch(p.midi);
    if (!active) { if (mode === "draw" && !disabled) { const next = { frame: quantize(p.frame, event.altKey), midi: props.globalSnapToKeyEnabled && !event.altKey ? snapScorePitch(p.midi, props.canvasKeyBase, props.canvasKeyType) : p.midi, length: step }; setDrawing((current) => current?.frame === next.frame && current.midi === next.midi && current.length === next.length ? current : next); } return; }
    if (disabled) return;
    const current = point(event);
    if (active.kind !== "draw" && Math.hypot(current.x - active.start.x, current.y - active.start.y) < 4) return;
    if (active.kind === "box") { setMarquee({ x: Math.min(active.start.x, current.x), y: Math.min(active.start.y, current.y), width: Math.abs(current.x - active.start.x), height: Math.abs(current.y - active.start.y) }); return; }
    if (active.kind === "draw") {
      const start = quantize(active.start.frame, event.altKey);
      setDrawing({ frame: start, midi: active.start.midi, length: Math.max(step, quantize(current.frame, event.altKey) - start + step) }); return;
    }
    if (active.kind === "velocity") return;
    const targets = active.targets ?? [];
    if (!targets.length) return;
    const anchor = targets[0], raw = current.frame - active.start.frame;
    const anchorFrame = active.kind === "right" ? anchor.start + anchor.length : anchor.start;
    let shift = snapMidiFrame(anchorFrame + raw, step) - anchorFrame;
    const shortest = Math.min(...targets.map((note) => note.length)), earliest = Math.min(...targets.map((note) => note.start));
    const minimum = Math.min(step, shortest);
    if (active.kind === "left") shift = Math.max(-earliest, Math.min(shortest - minimum, shift));
    else if (active.kind === "move") shift = Math.max(-earliest, shift);
    let transpose = current.midi - active.start.midi;
    transpose = Math.max(-Math.min(...targets.map((note) => note.midi)), Math.min(127 - Math.max(...targets.map((note) => note.midi)), transpose));
    const change: MidiEdit = active.kind === "left" ? { shift, lengthDelta: -shift } : active.kind === "right"
      ? { lengthDelta: Math.max(minimum - shortest, shift) } : { shift, transpose };
    if (active.kind === "move" && props.globalSnapToKeyEnabled && !event.altKey) change.key = { root: props.canvasKeyBase ?? 0, type: props.canvasKeyType ?? 0 };
    setPreview((current) => current?.shift === change.shift && current?.transpose === change.transpose && current?.lengthDelta === change.lengthDelta && current?.key?.root === change.key?.root && current?.key?.type === change.key?.type ? current : change);
    const previewPitch = change.key ? snapScorePitch(anchor.midi + transpose, change.key.root, change.key.type) : anchor.midi + transpose;
    if (auditionDrag && active.kind === "move" && lastAudition.current !== previewPitch) { lastAudition.current = previewPitch; void audition(lastAudition.current); }
  };
  moveAt.current = move;
  const end = (event: ReactPointerEvent) => {
    const active = gesture.current; if (!active) return;
    if (!disabled && active.base === snapshotRef.current) {
      if (active.kind === "draw") insert(drawing?.frame ?? quantize(active.start.frame, event.altKey), drawing?.midi ?? active.start.midi, drawing?.length ?? step, event.altKey);
      else if (active.kind === "box") {
        const p = point(event), left = Math.min(active.start.x, p.x), right = Math.max(active.start.x, p.x), top = Math.min(active.start.y, p.y), bottom = Math.max(active.start.y, p.y);
        const keys = Math.hypot(p.x - active.start.x, p.y - active.start.y) < 4 ? [] : events.filter((note) => note.start * scale <= right && (note.start + note.length) * scale >= left && (127 - note.midi) * ROW <= bottom && (128 - note.midi) * ROW >= top).map((note) => note.key);
        setSelection(active.additive ? [...new Set([...active.keys, ...keys])] : keys);
      } else if (preview) { applyEdit(active.keys, preview); if (active.kind === "move") { const note = active.targets?.[0]; if (note) void audition(preview.key ? snapScorePitch(note.midi + (preview.transpose ?? 0), preview.key.root, preview.key.type) : note.midi + (preview.transpose ?? 0)); } }
    }
    clearGesture();
  };
  const clipboardAction = (cut = false) => { clipboard.current = selected.map((event) => ({ ...event })); if (cut) applyEdit(selection, { remove: true }); };
  const paste = (frame: number) => { const result = pasteMidiEvents(snapshotRef.current, clipboard.current, quantize(frame)); commit(result.snapshot); setSelection(result.keys); };
  const beginVelocity = (note: ScoreEvent, event: ReactPointerEvent<SVGElement>) => {
    if (disabled) return; event.preventDefault(); event.stopPropagation(); focus();
    const keys = chosen.has(note.key) ? selection : [note.key]; setSelection(keys);
    gesture.current = { kind: "velocity", keys, start: point(event), base: snapshotRef.current, additive: false };
    (event.currentTarget.closest("svg") as SVGSVGElement | null)?.setPointerCapture(event.pointerId);
  };
  const keyConstraint = () => props.globalSnapToKeyEnabled ? { root: props.canvasKeyBase ?? 0, type: props.canvasKeyType ?? 0 } : undefined;
  const zoomAt = (value: number, clientX?: number) => {
    const element = scroller.current; if (!element) return;
    const anchor = clientX === undefined ? element.clientWidth / 2 : Math.max(KEY_WIDTH, clientX - element.getBoundingClientRect().left);
    const frame = (element.scrollLeft + anchor - KEY_WIDTH) / scale;
    const next = Math.max(0.05, Math.min(1920, value));
    restoreScroll.current = { left: Math.max(0, frame * next / framesPerBar - anchor + KEY_WIDTH), top: element.scrollTop };
    setZoom(next);
  };
  useEffect(() => {
    const element = scroller.current; if (!element) return;
    const wheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey) { event.preventDefault(); zoomAt(zoom * Math.exp(-event.deltaY * 0.002), event.clientX); }
      else if (event.shiftKey) { event.preventDefault(); element.scrollLeft += event.deltaY + event.deltaX; }
    };
    element.addEventListener("wheel", wheel, { passive: false });
    return () => element.removeEventListener("wheel", wheel);
  }, [zoom, scale]); // eslint-disable-line react-hooks/exhaustive-deps
  const info = selected[0];
  const editPitch = info ? preview?.key ? snapScorePitch(info.midi + (preview.transpose ?? 0), preview.key.root, preview.key.type) : info.midi + (preview?.transpose ?? 0) : drawing?.midi;
  return <div ref={root} tabIndex={0} data-gte-midi-editor="true" className="flex min-h-0 min-w-0 w-full flex-col gap-2 outline-none" style={{ height: workspaceHeight }} onFocus={() => props.onFocusWorkspace?.()}
    onPointerDownCapture={(event) => { if (!(event.target as HTMLElement).closest('[role="menu"]')) setMenu(null); }}
    onKeyDown={(event) => {
      if ((event.target as HTMLElement).closest("input,select,textarea") || disabled) return;
      const key = event.key.toLowerCase(), mod = event.ctrlKey || event.metaKey;
      if (mod && key === "z") { event.preventDefault(); event.stopPropagation(); if (event.shiftKey) props.onRequestRedo?.(); else props.onRequestUndo?.(); }
      else if (mod && key === "y") { event.preventDefault(); event.stopPropagation(); props.onRequestRedo?.(); }
      else if (mod && key === "a") { event.preventDefault(); event.stopPropagation(); setSelection(events.map((note) => note.key)); }
      else if (mod && (key === "c" || key === "x")) { event.preventDefault(); event.stopPropagation(); clipboardAction(key === "x"); }
      else if (mod && key === "v") { event.preventDefault(); event.stopPropagation(); paste(cursor.current); }
      else if (mod && key === "d") { event.preventDefault(); event.stopPropagation(); clipboardAction(); paste(Math.max(...selected.map((note) => note.start + note.length), 0)); }
      else if (key === "escape") { event.stopPropagation(); clearGesture(); setSelection([]); setMode("select"); setMenu(null); }
      else if (key === "delete" || key === "backspace") { event.preventDefault(); event.stopPropagation(); applyEdit(selection, { remove: true }); }
      else if (key.startsWith("arrow") && selection.length) { event.preventDefault(); event.stopPropagation(); applyEdit(selection,
        key === "arrowup" || key === "arrowdown" ? { transpose: (key === "arrowup" ? 1 : -1) * (event.shiftKey ? 12 : 1), key: event.altKey ? undefined : keyConstraint() } : { shift: quantize(Math.min(...selected.map(note => note.start)) + (key === "arrowright" ? 1 : -1) * step) - Math.min(...selected.map(note => note.start)) }); }
      else if (key === "b" && !mod) { event.preventDefault(); setMode((value) => value === "draw" ? "select" : "draw"); }
      else if (key === "f" && !mod) { event.preventDefault(); event.stopPropagation(); if (event.shiftKey && selected.length) fit(selected); else fit(); }
      else if (key === "home") { event.preventDefault(); event.stopPropagation(); centerPlayback(); }
      else if (key === " " && !(event.target as HTMLElement).closest("button")) { event.preventDefault(); event.stopPropagation(); props.onGlobalPlaybackToggle?.(); }
    }}>
    <GteMidiToolbar mode={mode} disabled={disabled} onMode={value => { setMode(value); focus(); }}
      onUndo={props.onRequestUndo} onRedo={props.onRequestRedo} undoCount={props.historyUndoCount} redoCount={props.historyRedoCount}
      grid={grid} triplet={triplet} onGrid={(value, isTriplet) => { setGrid(value); setTriplet(isTriplet); }}
      keyBase={props.canvasKeyBase ?? 0} keyType={props.canvasKeyType ?? 0} onKeyChange={props.onCanvasKeyChange}
      snapToKey={Boolean(props.globalSnapToKeyEnabled)} onSnapToKey={props.onGlobalSnapToKeyEnabledChange}
      voice={selected[0]?.voice ?? voice} onVoice={value => { setVoice(value); if (selection.length) applyEdit(selection, { voice: value }); }}
      hasSelection={selected.length > 0} onFitAll={() => fit()} onFitSelection={() => fit(selected)}
      zoom={zoom} row={row} onZoom={value => zoomAt(value)} onRow={next => { if (scroller.current) restoreScroll.current = { left: scroller.current.scrollLeft, top: scroller.current.scrollTop * next / row }; setRow(next); }}
      follow={follow} onFollow={setFollow} audition={auditionDrag} onAudition={setAuditionDrag}
      labels={showNoteLabels} onLabels={setShowNoteLabels} onCenter={centerPlayback} />
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-slate-300 bg-[#faf9f5]">
      <div ref={scroller} data-midi-scroll="true" className="relative min-h-32 flex-1 overflow-auto overscroll-contain" onScroll={(event) => { const e = event.currentTarget; setViewport({ left: e.scrollLeft, top: e.scrollTop, width: e.clientWidth, height: e.clientHeight }); }}>
        <div style={{ width: width + KEY_WIDTH }}>
          <div className="sticky top-0 z-30 flex h-7 bg-[#eeede7]" style={{ width: width + KEY_WIDTH }}>
            <div className="sticky left-0 z-10 flex shrink-0 items-center justify-center border-r border-slate-300 bg-[#eeede7] text-[10px] text-slate-500" style={{ width: KEY_WIDTH }}>{t("Pitch")}</div>
            <svg width={width} height={28} role="slider" tabIndex={0} aria-label={t("MIDI playhead")} aria-valuemin={0} aria-valuemax={bars * framesPerBar} aria-valuenow={props.globalPlaybackFrame ?? 0}
              onPointerDown={(event) => { cursor.current = quantize((event.clientX - event.currentTarget.getBoundingClientRect().left) / scale, event.altKey); rulerGesture.current = { x: event.clientX, frame: cursor.current }; event.currentTarget.setPointerCapture(event.pointerId); props.onGlobalPlaybackFrameChange?.(cursor.current); focus(); }}
              onPointerMove={(event) => { const start = rulerGesture.current; if (!start || Math.abs(start.x - event.clientX) < 4) return; const frame = quantize((event.clientX - event.currentTarget.getBoundingClientRect().left) / scale, event.altKey); setLoopPreview({ startFrame: Math.min(start.frame, frame), endFrame: Math.max(start.frame, frame) + step }); }}
              onPointerUp={() => { if (loopPreview) props.onMidiLoopRangeChange?.(loopPreview); rulerGesture.current = null; setLoopPreview(null); }}
              onPointerCancel={() => { rulerGesture.current = null; setLoopPreview(null); }}
              onDoubleClick={() => props.onMidiLoopRangeChange?.(null)}
              onKeyDown={(event) => { if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); event.stopPropagation(); cursor.current = Math.max(0, cursor.current + (event.key === "ArrowRight" ? step : -step)); props.onGlobalPlaybackFrameChange?.(cursor.current); } }}>
              {(loopPreview ?? props.midiLoopRange) && <rect x={(loopPreview ?? props.midiLoopRange)!.startFrame * scale} y={0} width={((loopPreview ?? props.midiLoopRange)!.endFrame - (loopPreview ?? props.midiLoopRange)!.startFrame) * scale} height={28} fill="#059669" fillOpacity={0.14} stroke="#059669" />}
              {Array.from({ length: Math.ceil(viewport.width / (zoom * rulerStride)) + 2 }, (_, offset) => (Math.floor(viewport.left / (zoom * rulerStride)) + offset) * rulerStride).filter((index) => index < bars).map((index) => <g key={index}><line x1={index * zoom} x2={index * zoom} y1={0} y2={28} stroke="#899b8e" /><text x={index * zoom + 6} y={17} fontSize={10} fontWeight={600} fill="#53645b">{index + 1}</text>{zoom >= 220 && Array.from({ length: meter - 1 }, (_, beat) => <g key={beat}><line x1={index * zoom + (beat + 1) * zoom / meter} x2={index * zoom + (beat + 1) * zoom / meter} y1={22} y2={28} stroke="#a3b0a5" /><text x={index * zoom + (beat + 1) * zoom / meter + 4} y={18} fontSize={9} fill="#7e8c81">{index + 1}.{beat + 2}</text></g>)}</g>)}
            </svg>
          </div>
          <div className="relative" style={{ height: PITCH_HEIGHT }}>
            <svg ref={surface} width={width} height={PITCH_HEIGHT} className="absolute select-none" style={{ left: KEY_WIDTH, touchAction: "none", cursor: mode === "draw" ? "crosshair" : "default" }} role="group" aria-label={t("MIDI piano roll")}
              onPointerDown={(event) => { if (event.button !== 0 || disabled) return;
                const p = point(event);
                const hit = dense ? [...visible].reverse().find((note) => note.midi === p.midi && note.start <= p.frame && note.start + note.length >= p.frame) : undefined;
                if (hit) { const keys = event.shiftKey ? [...new Set([...selection, hit.key])] : chosen.has(hit.key) ? selection : [hit.key]; setSelection(keys); capture(event, "move", keys); return; }
                cursor.current = quantize(p.frame, event.altKey); props.onGlobalPlaybackFrameChange?.(cursor.current); capture(event, mode === "draw" ? "draw" : "box", event.shiftKey ? selection : []); if (mode === "select" && !event.shiftKey) setSelection([]); }}
              onPointerMove={move} onPointerUp={end} onPointerCancel={clearGesture} onLostPointerCapture={clearGesture}
              onPointerLeave={() => { setHoverPitch(null); if (!gesture.current) setDrawing(null); }}
              onContextMenu={(event) => { event.preventDefault(); const p = point(event); setMenu({ x: event.clientX, y: event.clientY, frame: quantize(p.frame), midi: p.midi }); }}
              onDoubleClick={(event) => { if (mode === "select") { const p = point(event); insert(quantize(p.frame, event.altKey), p.midi, step, event.altKey); } }}>
              <defs><pattern id={"midi-grid-" + snapshot.id} width={patternWidth} height={ROW} patternUnits="userSpaceOnUse"><path d={`M0 0H${patternWidth}M0 0V${ROW}`} fill="none" stroke="#cdd5ce" strokeWidth={0.6} /></pattern></defs>
              {Array.from({ length: 128 }, (_, index) => <g key={index}><rect x={0} y={index * ROW} width={width} height={ROW} fill={black(127 - index) ? "#e9ece7" : "#fafbf8"} />{(127 - index) % 12 === 0 && <line x1={0} x2={width} y1={(index + 1) * ROW} y2={(index + 1) * ROW} stroke="#aebdb2" strokeWidth={1.1} />}</g>)}
              {[...new Set(selected.map((note) => note.midi))].map((pitch) => <rect key={pitch} x={0} y={(127 - pitch) * ROW} width={width} height={ROW} fill="#059669" fillOpacity={0.09} pointerEvents="none" />)}
              {hoverPitch !== null && <rect x={0} y={(127 - hoverPitch) * ROW} width={width} height={ROW} fill="#637c6c" fillOpacity={0.05} pointerEvents="none" />}
              <rect width={width} height={PITCH_HEIGHT} fill={`url(#midi-grid-${snapshot.id})`} />
              {Array.from({ length: Math.ceil(viewport.width / zoom * meter / beatStride) + 3 }, (_, offset) => (Math.max(0, Math.floor(viewport.left / zoom * meter / beatStride)) + offset) * beatStride).filter((index) => index < bars * meter).map((index) => <line key={index} x1={index * zoom / meter} x2={index * zoom / meter} y1={0} y2={PITCH_HEIGHT} stroke={index % meter === 0 ? "#82958a" : "#b9c6bd"} strokeWidth={index % meter === 0 ? 1.5 : 0.8} />)}
              {dense && <g data-midi-density="true">{densityPaths.map((path, index) => <path key={index} d={path} fill={["#34b58b", "#669a91", "#acf0d6"][index]} stroke={index === 2 ? "#174b37" : "none"} strokeWidth={0.7} />)}</g>}
              {(dense ? visible.filter((note) => chosen.has(note.key)).slice(0, 100) : visible).map((note) => {
                const edit = chosen.has(note.key) ? preview : null;
                const pitch = edit?.key ? snapScorePitch(note.midi + (edit.transpose ?? 0), edit.key.root, edit.key.type) : note.midi + (edit?.transpose ?? 0);
                const x = (note.start + (edit?.shift ?? 0)) * scale, y = (127 - pitch) * ROW + 1.5, w = Math.max(3, (note.length + (edit?.lengthDelta ?? 0)) * scale);
                const begin = (event: ReactPointerEvent, kind: Gesture["kind"]) => {
                  if (disabled || event.button !== 0) return; event.stopPropagation();
                  if (event.shiftKey) { setSelection(chosen.has(note.key) ? selection.filter((key) => key !== note.key) : [...selection, note.key]); return; }
                  const keys = chosen.has(note.key) ? selection : [note.key]; setSelection(keys); capture(event, kind, keys); lastAudition.current = note.midi; void audition(note.midi);
                };
                return <g key={note.key} data-midi-note={note.key} role="button" tabIndex={0} aria-label={`${midiPitchName(note.midi)} · ${t("Velocity")} ${Math.round(note.velocity * 127)}`} aria-pressed={chosen.has(note.key)}
                  onDoubleClick={(event) => event.stopPropagation()} onContextMenu={(event) => { event.preventDefault(); event.stopPropagation(); if (!chosen.has(note.key)) setSelection([note.key]); setMenu({ x: event.clientX, y: event.clientY, frame: note.start, midi: note.midi }); }}
                  onKeyDown={(event) => { if (event.key === "Enter") { event.stopPropagation(); setSelection([note.key]); void audition(note.midi); } }}>
                  <rect x={x} y={y} width={w} height={Math.max(4, ROW - 3)} rx={2} className="cursor-grab hover:brightness-110" fill={chosen.has(note.key) ? "#acf0d6" : note.voice === 2 ? "#669a91" : "#34b58b"} fillOpacity={0.7 + note.velocity * 0.3} stroke={chosen.has(note.key) ? "#174b37" : "#34856a"} strokeWidth={chosen.has(note.key) ? 1.6 : 0.65} onPointerDown={(event) => begin(event, "move")} />
                  {showNoteLabels && w > 30 && <text x={x + 5} y={y + 10} fontSize={9} fill="#123d2d" pointerEvents="none">{midiPitchName(note.midi)}</text>}
                  <rect x={x} y={y} width={Math.min(6, w / 3)} height={ROW - 4} fill="transparent" cursor="ew-resize" onPointerDown={(event) => begin(event, "left")} />
                  <rect x={x + w - Math.min(6, w / 3)} y={y} width={Math.min(6, w / 3)} height={ROW - 4} fill="transparent" cursor="ew-resize" onPointerDown={(event) => begin(event, "right")} />
                </g>;
              })}
              {drawing && <rect x={drawing.frame * scale} y={(127 - drawing.midi) * ROW + 2} width={drawing.length * scale} height={ROW - 4} rx={2} fill="#86dec0" stroke="#175a43" pointerEvents="none" />}
              {marquee && <rect {...marquee} fill="#059669" fillOpacity={0.1} stroke="#059669" pointerEvents="none" />}
              <MidiPlayhead scale={scale} row={ROW} height={PITCH_HEIGHT} frame={props.globalPlaybackFrame ?? 0} playing={Boolean(props.globalPlaybackIsPlaying)} getFrame={props.getGlobalPlaybackFrame} notes={visible} scroll={scroller} follow={follow && !gesture.current} />
            </svg>
            <div className="sticky left-0 z-20 border-r border-[#a5afa5] bg-[#fffdf5] shadow-[2px_0_5px_#263c3212]" style={{ width: KEY_WIDTH, height: PITCH_HEIGHT }}>
              {[false, true].flatMap((isBlack) => Array.from({ length: 128 }, (_, index) => 127 - index).filter((midi) => black(midi) === isBlack).map((midi) => {
                const extraTop = !isBlack && midi < 127 && black(midi + 1) ? ROW / 2 : 0, extraBottom = !isBlack && midi > 0 && black(midi - 1) ? ROW / 2 : 0;
                return <button key={midi} type="button" aria-label={t("Audition") + " " + midiPitchName(midi)} title={midiPitchName(midi)} className={`absolute left-0 flex items-center justify-end rounded-r-sm border-b pr-2 text-[10px] ${isBlack ? "z-10 border-[#20362a] bg-[#33483b] text-white shadow-[inset_0_-2px_0_#172b20]" : "border-[#b9c2b7] bg-[#fffdf5] text-[#5e7264]"} ${selected.some((note) => note.midi === midi) ? "!bg-[#b9e5cf] !text-[#174b37]" : "hover:brightness-95"}`} style={{ top: (127 - midi) * ROW - extraTop + (isBlack ? ROW * 0.05 : 0), width: isBlack ? "65%" : "100%", height: isBlack ? ROW * 0.9 : ROW + extraTop + extraBottom }} onClick={() => { void audition(midi); setHoverPitch(midi); focus(); }}>{!isBlack && midi % 12 === 0 ? midiPitchName(midi) : ""}</button>;
              }))}
            </div>
          </div>
        </div>
      </div>
      <div data-midi-velocity-header="true" className="relative flex h-8 shrink-0 items-center gap-2 border-t border-slate-300 bg-[#eeede7] px-2 text-[10px] text-slate-600">
        <button type="button" title={t("Show or hide velocity lane")} aria-label={t("Show or hide velocity lane")} className="flex h-7 shrink-0 items-center gap-1 rounded px-1 hover:bg-black/5" aria-expanded={velocityHeight > 0} onClick={() => { if (velocityHeight) { lastVelocityHeight.current = velocityHeight; setVelocityHeight(0); } else setVelocityHeight(lastVelocityHeight.current); }}><span aria-hidden="true">{velocityHeight ? "▾" : "▸"}</span><span className="hidden sm:inline">{t("Velocity")}</span></button>
        <span className="shrink-0 tabular-nums text-slate-500">0–127</span>
        <span data-midi-edit-info="true" aria-live="off" className="min-w-0 flex-1 truncate text-slate-500" title={info ? `${midiPitchName(editPitch ?? info.midi)} · ${t("Start")} ${midiPosition(info.start + (preview?.shift ?? 0), snapshot)}` : undefined}>{info ? `${midiPitchName(editPitch ?? info.midi)} · ${midiPosition(info.start + (preview?.shift ?? 0), snapshot)}` : ""}</span>
        {selected.length > 0 && <input type="number" aria-label={t("Selected velocity")} title={t("Selected velocity · 0–127")} min={0} max={127} className="h-6 w-12 rounded border border-slate-200 bg-white px-1 text-xs tabular-nums" value={Math.round((preview?.velocity ?? selected[0].velocity ?? 1) * 127)} disabled={disabled} onChange={event => { const value = Number(event.target.value); if (Number.isFinite(value) && value >= 0 && value <= 127) applyEdit(selection, { velocity: Math.round(value) / 127 }); }} />}
        <label className="flex shrink-0 items-center gap-1"><span className="hidden sm:inline">{t("Lane")}</span><select aria-label={t("MIDI controller lane")} defaultValue="velocity" className="h-6 rounded border border-slate-200 bg-white px-1 text-xs"><option value="velocity">{t("Velocity")}</option></select></label>
        <div role="separator" title={t("Resize velocity lane")} aria-label={t("Resize velocity lane")} aria-orientation="horizontal" aria-valuemin={0} aria-valuemax={240} aria-valuenow={VELOCITY_HEIGHT} tabIndex={0} className="flex h-6 w-6 shrink-0 cursor-row-resize items-center justify-center rounded hover:bg-black/5" style={{ touchAction: "none" }}
          onPointerDown={(event) => { event.preventDefault(); event.stopPropagation(); velocityResizeCleanup.current(); const y = event.clientY, base = VELOCITY_HEIGHT; event.currentTarget.setPointerCapture?.(event.pointerId); const move = (e: PointerEvent) => setVelocityHeight(Math.max(40, Math.min(240, workspaceHeight - 220, base + y - e.clientY))); const end = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", end); window.removeEventListener("pointercancel", end); }; velocityResizeCleanup.current = end; window.addEventListener("pointermove", move); window.addEventListener("pointerup", end); window.addEventListener("pointercancel", end); }}
          onKeyDown={(event) => { if (event.key === "ArrowUp" || event.key === "ArrowDown") { event.preventDefault(); event.stopPropagation(); setVelocityHeight(Math.max(40, Math.min(240, workspaceHeight - 220, VELOCITY_HEIGHT + (event.key === "ArrowUp" ? 10 : -10)))); } }}><svg viewBox="0 0 16 16" className="h-4 w-4 fill-current" aria-hidden="true">{[4,8,12].flatMap(y => [5,11].map(x => <circle key={`${x}:${y}`} cx={x} cy={y} r={1} />))}</svg></div>
        {selected.length > 0 && <details className="relative ml-auto"><summary className="cursor-pointer list-none" title={t("Scale selected velocities")}>{t("Scale")} ▾</summary><div className="absolute bottom-7 right-0 z-40 flex items-center gap-2 rounded-lg border border-slate-200 bg-[#faf9f5] p-2 shadow-lg"><input type="number" aria-label={t("Velocity scale percent")} min={1} max={400} value={velocityScale} onChange={(event) => setVelocityScale(Number(event.target.value))} className="w-14 rounded border border-slate-200 px-1 py-1" />%<button type="button" disabled={disabled || velocityScale <= 0 || velocityScale > 400} onClick={() => applyEdit(selection, { velocityScale: velocityScale / 100 })}>{t("Apply")}</button></div></details>}
        {preview?.velocity !== undefined && <span>{Math.round(preview.velocity * 127)}</span>}
      </div>
      <div className="relative shrink-0 overflow-hidden bg-[#f1f2ec]" style={{ height: VELOCITY_HEIGHT }}>
        <div className="absolute inset-y-0 left-0 z-10 border-r border-slate-300 bg-[#eeede7] px-2 text-right text-[9px] tabular-nums text-slate-500" style={{ width: KEY_WIDTH }}>{[127,96,64,32,0].map(value => <span key={value} className="absolute right-2" style={{ top: 6 + (1 - value / 127) * (VELOCITY_HEIGHT - 12), transform: "translateY(-50%)" }}>{value}</span>)}</div>
        <svg width={width} height={VELOCITY_HEIGHT} style={{ marginLeft: KEY_WIDTH, transform: `translateX(-${viewport.left}px)`, touchAction: "none" }} aria-label={t("MIDI velocity lane")}
          onPointerDown={(event) => { if (disabled || !velocityPaths.length) return; const bounds = event.currentTarget.getBoundingClientRect(), frame = (event.clientX - bounds.left) / scale; const note = velocityEvents.reduce<ScoreEvent | undefined>((best, note) => !best || Math.abs(note.start - frame) < Math.abs(best.start - frame) ? note : best, undefined); if (note) beginVelocity(note, event); }}
          onPointerMove={(event) => { const active = gesture.current; if (active?.kind !== "velocity") return; const bounds = event.currentTarget.getBoundingClientRect(); setPreview({ velocity: Math.max(0, Math.min(1, 1 - (event.clientY - bounds.top - 6) / (VELOCITY_HEIGHT - 12))) }); }}
          onPointerUp={(event) => { const active = gesture.current; if (active?.kind === "velocity" && active.base === snapshotRef.current && preview) applyEdit(active.keys, preview); clearGesture(); event.currentTarget.releasePointerCapture?.(event.pointerId); }} onPointerCancel={clearGesture} onLostPointerCapture={clearGesture}>
          {velocityPaths.map((path, index) => <path key={index} d={path} stroke={["#34b58b", "#669a91", "#175a43"][index]} strokeWidth={2} fill="none" data-midi-velocity-density="true" />)}
          {(velocityPaths.length ? velocityEvents.filter((note) => chosen.has(note.key)).slice(0, 100) : velocityEvents).map((note) => {
            const velocity = chosen.has(note.key) ? preview?.velocity ?? note.velocity : note.velocity, x = note.start * scale + 3, y = 6 + (1 - velocity) * (VELOCITY_HEIGHT - 12);
            return <g key={note.key} aria-label={`${midiPitchName(note.midi)} ${t("Velocity")} ${Math.round(velocity * 127)}`} onPointerDown={(event) => beginVelocity(note, event)} className="cursor-ns-resize">
              <rect x={x - 5} y={Math.max(0, y - 5)} width={10} height={Math.max(10, VELOCITY_HEIGHT - y + 5)} fill="transparent" />
              <line x1={x} x2={x} y1={VELOCITY_HEIGHT - 5} y2={y} stroke={chosen.has(note.key) ? "#175a43" : note.voice === 2 ? "#669a91" : "#34b58b"} strokeWidth={5} />
              <circle cx={x} cy={y} r={4} fill={chosen.has(note.key) ? "#175a43" : note.voice === 2 ? "#669a91" : "#34b58b"} />
            </g>;
          })}
        </svg>
      </div>
    </div>
    {menu && <div role="menu" data-gte-floating-ui="true" className="fixed z-[10045] grid min-w-48 gap-0.5 rounded-lg border border-slate-200 bg-[#faf9f5] p-1 shadow-xl" style={{ left: Math.min(menu.x, window.innerWidth - 210), top: Math.max(8, Math.min(menu.y, window.innerHeight - 290)) }}
      onKeyDown={(event) => { if (event.key === "Escape") setMenu(null); }}>
      {[
        ["Add note", "Double-click", () => insert(menu.frame, menu.midi), disabled],
        ["Copy", "Ctrl+C", () => clipboardAction(), !selected.length],
        ["Cut", "Ctrl+X", () => clipboardAction(true), disabled || !selected.length],
        ["Paste", "Ctrl+V", () => paste(menu.frame), disabled || !clipboard.current.length],
        ["Duplicate", "Ctrl+D", () => { clipboardAction(); paste(Math.max(...selected.map((note) => note.start + note.length))); }, disabled || !selected.length],
        ["Delete", "Delete", () => applyEdit(selection, { remove: true }), disabled || !selected.length],
        ["Fit selection", "Shift+F", () => fit(selected), !selected.length],
        ["Fit all", "F", () => fit(), false],
      ].map(([label, shortcut, action, inactive]) => <button key={String(label)} type="button" role="menuitem" disabled={Boolean(inactive)} className="flex items-center justify-between gap-6 rounded px-3 py-1.5 text-left text-xs text-slate-700 hover:bg-black/5 disabled:opacity-35" onClick={() => { (action as () => void)(); setMenu(null); focus(); }}><span>{t(String(label))}</span><span className="text-[10px] text-slate-400">{String(shortcut)}</span></button>)}
    </div>}
  </div>;
}
