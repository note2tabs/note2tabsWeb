import { useEffect, useMemo, useRef, useState } from "react";
import type { ComponentProps } from "react";
import type GteWorkspace from "./GteWorkspace";
import { scoreEvents } from "../lib/gteNotation";
import { pianoPitchCenter, isBlackPianoKey as blackKey, practiceNoteWindow, practicePitchRange, PRACTICE_VOICE_COLORS } from "../lib/gtePracticePianoRoll";
import GtePracticeScrubber from "./GtePracticeScrubber";

type Props = ComponentProps<typeof GteWorkspace>;

/** Read-only view of the shared score and audio clock; owns no transport state. */
export default function GtePracticePianoRoll(props: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const live = useRef(props);
  live.current = props;
  const [canPan, setCanPan] = useState(false);
  const notes = useMemo(() => scoreEvents(props.snapshot).sort((a, b) => a.start - b.start), [props.snapshot]);
  const range = useMemo(() => practicePitchRange(notes.map(note => note.midi)), [notes]);

  useEffect(() => {
    const host = viewport.current, surface = canvas.current;
    const ctx = surface?.getContext("2d");
    if (!host || !surface || !ctx) return;
    let width = 0, height = 0, animation = 0, pixelRatio = 0;
    let dirty = true, lastFrame = NaN;
    const count = range.high - range.low + 1;
    const pitches = Array.from({ length: count }, (_, index) => range.low + index);
    const keyOrder = [...pitches.filter(pitch => !blackKey(pitch)), ...pitches.filter(blackKey)];
    const pitchVoices = new Map<number, number>();
    for (const note of notes) pitchVoices.set(note.midi, (pitchVoices.get(note.midi) ?? 0) | (note.voice === 2 ? 2 : 1));
    const resize = () => {
      const whiteCount = pianoPitchCenter(range.high) - pianoPitchCenter(range.low) + 1;
      const nextWidth = Math.max(host.clientWidth, whiteCount * 18);
      const nextHeight = host.clientHeight;
      if (nextHeight <= 0 || host.clientWidth <= 0) return;
      setCanPan(nextWidth > host.clientWidth + 1);
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      // Assigning canvas dimensions clears its bitmap, even at the same size.
      if (nextWidth === width && nextHeight === height && dpr === pixelRatio) return;
      width = nextWidth; height = nextHeight; pixelRatio = dpr; dirty = true;
      surface.width = Math.round(width * dpr); surface.height = Math.round(height * dpr);
      surface.style.width = `${width}px`; surface.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const draw = () => {
      const current = live.current;
      const frame = current.getGlobalPlaybackFrame?.() ?? current.globalPlaybackFrame ?? 0;
      // Keep one stable loop through play/pause/seek. Paused frames need no
      // painting unless the clock changes or a resize invalidates the bitmap.
      if (!width || !height) return;
      if (!dirty && frame === lastFrame) return;
      dirty = false; lastFrame = frame;
      const horizon = Math.max(1, current.snapshot.fps || 240) * 5;
      const origin = pianoPitchCenter(range.low) - 0.5;
      const whiteCount = pianoPitchCenter(range.high) + 0.5 - origin;
      const unit = Math.min(26, width / whiteCount);
      const offset = (width - unit * whiteCount) / 2;
      const whiteHeight = Math.max(82, Math.min(124, unit * 4.8));
      const blackHeight = whiteHeight * 0.62;
      const line = height - whiteHeight - 8;
      const keyRect = (pitch: number) => {
        const w = unit * (blackKey(pitch) ? 0.6 : 1);
        return { x: offset + (pianoPitchCenter(pitch) - origin) * unit - w / 2, w };
      };
      const active = new Map<number, number>();
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = "#faf9f5"; ctx.fillRect(0, 0, width, height);
      for (let pitch = range.low; pitch <= range.high; pitch++) {
        const { x, w } = keyRect(pitch);
        if (blackKey(pitch)) { ctx.fillStyle = "#243b3206"; ctx.fillRect(x, 0, w, line); }
        if (pitch % 12 === 0) { ctx.strokeStyle = "#dfe5df"; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, line); ctx.stroke(); }
      }
      const bar = current.snapshot.framesPerMessure || 480;
      const beats = Math.max(1, current.snapshot.timeSignature || 4);
      const beat = bar / beats;
      for (let tick = Math.ceil(frame / beat); tick * beat <= frame + horizon; tick++) {
        const y = line - (tick * beat - frame) / horizon * line;
        const measure = tick % beats === 0;
        ctx.strokeStyle = measure ? "#cbd8d0" : "#e5eae5"; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
        if (measure) { ctx.fillStyle = "#85958a"; ctx.font = "10px sans-serif"; ctx.textAlign = "left"; ctx.fillText(String(Math.floor(tick / beats) + 1), 7, y - 5); }
      }
      for (const note of notes) {
        if (note.start > frame + horizon) break;
        const visible = practiceNoteWindow(note.start, note.length, frame, horizon, line);
        if (!visible) continue;
        const voice = note.voice === 2 ? 2 : 1;
        const colors = PRACTICE_VOICE_COLORS[voice];
        if (visible.active) active.set(Math.round(note.midi), (active.get(Math.round(note.midi)) ?? 0) | voice);
        const { x, w } = keyRect(Math.round(note.midi));
        ctx.fillStyle = visible.active ? colors.active : colors.upcoming;
        // Inset the trailing edge only: adjacent attacks stay distinct without
        // moving their leading edge away from the playback timing line.
        const visibleHeight = visible.bottom - visible.top;
        const gap = Math.min(4, Math.max(0, visibleHeight - 2));
        const split = pitchVoices.get(note.midi) === 3;
        const noteWidth = split ? (w - 4) / 2 : w - 4;
        const noteX = x + 2 + (split && voice === 2 ? (w - 4) / 2 + 0.5 : 0);
        ctx.beginPath(); ctx.roundRect(noteX, visible.top + gap, Math.max(2, noteWidth - (split ? 0.5 : 0)), Math.max(2, visibleHeight - gap), 3); ctx.fill();
        ctx.strokeStyle = colors.border; ctx.lineWidth = 0.7; ctx.stroke();
        if (visible.active && visibleHeight > 9) { ctx.fillStyle = "#ffffff55"; ctx.fillRect(noteX + 2, visible.top + gap + 2, Math.max(1, noteWidth - 4), 1); }
      }
      // Draw white keys first, then shorter black keys above them.
      for (const pitch of keyOrder) {
        const { x, w } = keyRect(pitch), black = blackKey(pitch);
        const keyHeight = black ? blackHeight : whiteHeight;
        const voices = active.get(pitch) ?? 0;
        ctx.fillStyle = black ? "#243029" : "#fffefa";
        ctx.fillRect(x + 0.5, line + 5, w - 1, keyHeight);
        if (voices) {
          ctx.fillStyle = PRACTICE_VOICE_COLORS[voices === 2 ? 2 : 1].active;
          ctx.fillRect(x + 0.5, line + 5, voices === 3 ? (w - 1) / 2 : w - 1, keyHeight);
          if (voices === 3) { ctx.fillStyle = PRACTICE_VOICE_COLORS[2].active; ctx.fillRect(x + w / 2, line + 5, (w - 1) / 2, keyHeight); }
        }
        ctx.strokeStyle = black ? "#14251d" : "#bdc9c0"; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, line + 5, w - 1, keyHeight);
        if (black && !voices) { ctx.fillStyle = "#ffffff15"; ctx.fillRect(x + 2, line + 7, Math.max(1, w - 4), 2); }
        if (pitch % 12 === 0) {
          ctx.fillStyle = "#52665b"; ctx.font = "11px sans-serif"; ctx.textAlign = "center";
          ctx.fillText(`C${Math.floor(pitch / 12) - 1}`, x + w / 2, height - 10);
        }
      }
      ctx.fillStyle = "#bfd9cd"; ctx.fillRect(0, line - 2, width, 6);
      ctx.fillStyle = "#26765b"; ctx.fillRect(0, line, width, 2);
    };
    // Keep the bitmap out of layout. ResizeObserver must not repeatedly clear
    // the canvas in response to scrollbars induced by the canvas itself.
    resize(); draw();
    const observer = new ResizeObserver(() => { resize(); draw(); }); observer.observe(host);
    const animate = () => { draw(); animation = requestAnimationFrame(animate); };
    animation = requestAnimationFrame(animate);
    return () => { cancelAnimationFrame(animation); observer.disconnect(); };
  }, [notes, range]);

  useEffect(() => {
    const host = viewport.current;
    if (host) host.scrollLeft = Math.max(0, (host.scrollWidth - host.clientWidth) / 2);
  }, [range]);

  return <><GtePracticeScrubber {...props} />
  {canPan && <div className="mb-2 flex justify-end gap-1" role="group" aria-label="Visible octaves">
    <button type="button" className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600" aria-label="Show lower octaves" onClick={() => viewport.current?.scrollBy({ left: -viewport.current.clientWidth / 2, behavior: "smooth" })}>← Octaves</button>
    <button type="button" className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600" aria-label="Show higher octaves" onClick={() => viewport.current?.scrollBy({ left: viewport.current.clientWidth / 2, behavior: "smooth" })}>Octaves →</button>
  </div>}
  <div ref={viewport} className="relative w-full overflow-x-auto overflow-y-hidden rounded-lg border border-[#dce2da] [&::-webkit-scrollbar]:hidden" style={{ height: "clamp(260px, calc(100dvh - 340px), 720px)", scrollbarWidth: "none", contain: "layout size" }}>
    <canvas ref={canvas} className="absolute left-0 top-0 block" role="img" aria-label="Practice piano roll. Notes fall toward the keyboard. Use octave controls to see other pitches." />
  </div><div aria-hidden="true" className="h-36" /></>;
}
