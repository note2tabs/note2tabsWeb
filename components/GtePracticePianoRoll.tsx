import { useEffect, useMemo, useRef, useState } from "react";
import type { ComponentProps } from "react";
import type GteWorkspace from "./GteWorkspace";
import { scoreEvents } from "../lib/gteNotation";
import { pianoPitchCenter, isBlackPianoKey as blackKey, practiceNoteWindow, practicePitchRange, practiceKeyIllumination, practiceVisibleStart, PRACTICE_NOTE_GAP_PX, PRACTICE_VOICE_COLORS } from "../lib/gtePracticePianoRoll";
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
    window.scrollTo?.(0, 0);
    host.closest?.("main")?.scrollTo?.(0, 0);
    let width = 0, height = 0, animation = 0, pixelRatio = 0;
    let dirty = true, lastFrame = NaN;
    let whiteHeight = 100, blackHeight = 62, line = 1;
    let background: CanvasGradient, vignette: CanvasGradient, whiteKey: CanvasGradient, blackKeyFill: CanvasGradient;
    const rectangles = new Map<number, { x: number; w: number }>();
    const noteRectangles = new Map<number, { x: number; w: number }>();
    const gradients = new Map<string, CanvasGradient>();
    const prefixEnds: number[] = [];
    for (const note of notes) prefixEnds.push(Math.max(prefixEnds[prefixEnds.length - 1] ?? 0, note.start + note.length));
    const count = range.high - range.low + 1;
    const pitches = Array.from({ length: count }, (_, index) => range.low + index);
    const keyOrder = [...pitches.filter(pitch => !blackKey(pitch)), ...pitches.filter(blackKey)];
    const pitchVoices = new Map<number, number>();
    for (const note of notes) pitchVoices.set(note.midi, (pitchVoices.get(note.midi) ?? 0) | (note.voice === 2 ? 2 : 1));
    const resize = () => {
      // Fit the roll above the fixed transport + timeline, rather than growing
      // the notation page and relying on scrolling to reach the keyboard.
      const rect = host.getBoundingClientRect?.();
      if (rect && window.innerHeight) {
        host.style.height = `${Math.max(96, Math.floor(window.innerHeight - 112 - rect.top))}px`;
      }
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
      const origin = pianoPitchCenter(range.low) - 0.5;
      const units = pianoPitchCenter(range.high) + 0.5 - origin;
      const unit = Math.min(24, width / units), offset = (width - unit * units) / 2;
      whiteHeight = Math.min(Math.max(78, unit * 4.6), height * 0.35);
      blackHeight = whiteHeight * 0.62; line = height - whiteHeight - 5;
      for (const pitch of pitches) { const w = unit * (blackKey(pitch) ? 0.57 : 1); rectangles.set(pitch, { x: offset + (pianoPitchCenter(pitch) - origin) * unit - w / 2, w }); }
      // Centre on the real keys but keep neighbouring chromatic lanes separate.
      const used = [...pitchVoices.keys()].sort((a,b) => a-b);
      used.forEach((pitch, index) => {
        const key = rectangles.get(Math.round(pitch))!, center = key.x + key.w / 2;
        const before = index ? (pianoPitchCenter(pitch) - pianoPitchCenter(used[index - 1])) * unit : unit;
        const after = index + 1 < used.length ? (pianoPitchCenter(used[index + 1]) - pianoPitchCenter(pitch)) * unit : unit;
        const w = Math.max(3, Math.min(key.w - 3, before - 2, after - 2));
        noteRectangles.set(pitch, { x: center - w / 2, w });
      });
      gradients.clear();
      background = ctx.createLinearGradient(0, 0, 0, line); background.addColorStop(0, "#0e1219"); background.addColorStop(1, "#222c39");
      vignette = ctx.createLinearGradient(0, 0, width, 0); vignette.addColorStop(0, "#00000055"); vignette.addColorStop(0.13, "#00000000"); vignette.addColorStop(0.87, "#00000000"); vignette.addColorStop(1, "#00000055");
      whiteKey = ctx.createLinearGradient(0, line, 0, height); whiteKey.addColorStop(0, "#d1d4dc"); whiteKey.addColorStop(0.1, "#f8f9fc"); whiteKey.addColorStop(0.92, "#e9ebf0"); whiteKey.addColorStop(1, "#b9bec9");
      blackKeyFill = ctx.createLinearGradient(0, line, 0, line + blackHeight); blackKeyFill.addColorStop(0, "#05070b"); blackKeyFill.addColorStop(0.1, "#13171e"); blackKeyFill.addColorStop(0.82, "#2b303b"); blackKeyFill.addColorStop(1, "#080a0f");
    };
    const draw = () => {
      const current = live.current;
      const frame = current.getGlobalPlaybackFrame?.() ?? current.globalPlaybackFrame ?? 0;
      // Keep one stable loop through play/pause/seek. Paused frames need no
      // painting unless the clock changes or a resize invalidates the bitmap.
      if (!width || !height) return;
      if (!dirty && frame === lastFrame) return;
      dirty = false; lastFrame = frame;
      const fps = Math.max(1, current.snapshot.fps || 240), horizon = fps * 5;
      const keyRect = (pitch: number) => rectangles.get(pitch)!;
      const active = new Map<number, number>();
      const illumination = new Map<number, [number, number]>();
      const impacts = new Map<number, [number, number]>();
      let glowingNotes = 0;
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = background; ctx.fillRect(0, 0, width, height);
      for (let pitch = range.low; pitch <= range.high; pitch++) {
        const { x, w } = keyRect(pitch);
        if (blackKey(pitch)) { ctx.fillStyle = "#00000018"; ctx.fillRect(x, 0, w, line); }
        if (pitch % 12 === 0) { ctx.strokeStyle = "#30353d"; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, line); ctx.stroke(); }
      }
      const bar = current.snapshot.framesPerMessure || 480;
      const beats = Math.max(1, current.snapshot.timeSignature || 4);
      const beat = bar / beats;
      for (let tick = Math.ceil(frame / beat); tick * beat <= frame + horizon; tick++) {
        const y = line - (tick * beat - frame) / horizon * line;
        const measure = tick % beats === 0;
        ctx.strokeStyle = measure ? "#ffffff18" : "#ffffff08"; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
        if (measure) { ctx.fillStyle = "#8f98a3"; ctx.font = "10px sans-serif"; ctx.textAlign = "left"; ctx.fillText(String(Math.floor(tick / beats) + 1), 7, y - 5); }
      }
      for (let index = practiceVisibleStart(prefixEnds, frame); index < notes.length; index++) {
        const note = notes[index];
        if (note.start > frame + horizon) break;
        const visible = practiceNoteWindow(note.start, note.length, frame, horizon, line);
        if (!visible) continue;
        const voice = note.voice === 2 ? 2 : 1;
        const colors = PRACTICE_VOICE_COLORS[voice];
        const power = practiceKeyIllumination(note.start, note.length, frame, horizon, line, fps);
        if (power > 0.01) {
          active.set(Math.round(note.midi), (active.get(Math.round(note.midi)) ?? 0) | voice);
          const levels = illumination.get(Math.round(note.midi)) ?? [0, 0]; levels[voice - 1] = Math.max(levels[voice - 1], power); illumination.set(Math.round(note.midi), levels);
          const pulses = impacts.get(Math.round(note.midi)) ?? [0, 0]; pulses[voice - 1] = Math.max(pulses[voice - 1], Math.exp(-(frame - note.start) / (fps * 0.08))); impacts.set(Math.round(note.midi), pulses);
        }
        const { x, w } = noteRectangles.get(note.midi)!;
        // Inset the trailing edge only: adjacent attacks stay distinct without
        // moving their leading edge away from the playback timing line.
        const visibleHeight = visible.bottom - visible.top;
        const gap = Math.min(PRACTICE_NOTE_GAP_PX, Math.max(0, visibleHeight - 6));
        const split = pitchVoices.get(note.midi) === 3;
        const noteWidth = split ? w / 2 : w;
        const noteX = x + (split && voice === 2 ? w / 2 + 0.5 : 0);
        const paintedWidth = Math.max(2, noteWidth - (split ? 0.5 : 0));
        const paintedHeight = Math.max(6, visibleHeight - gap), top = Math.max(0, visible.bottom - paintedHeight);
        const gradientKey = `${note.midi}:${voice}:${visible.active}`;
        let fill = gradients.get(gradientKey);
        if (!fill) { fill = ctx.createLinearGradient(noteX, 0, noteX + paintedWidth, 0); fill.addColorStop(0, colors.upcoming); fill.addColorStop(0.5, visible.active ? colors.active : colors.border); fill.addColorStop(1, colors.upcoming); gradients.set(gradientKey, fill); }
        ctx.fillStyle = fill;
        ctx.shadowColor = colors.upcoming; ctx.shadowBlur = visible.bottom > line * 0.8 && glowingNotes++ < 32 ? 7 : 0;
        ctx.beginPath(); ctx.roundRect(noteX, top, paintedWidth, paintedHeight, 3); ctx.fill();
        ctx.shadowBlur = 0; ctx.strokeStyle = colors.border; ctx.lineWidth = 0.8; ctx.stroke();
        ctx.fillStyle = visible.active ? "#ffffffbb" : colors.active; ctx.fillRect(noteX + 1, visible.bottom - 1.5, Math.max(1, paintedWidth - 2), 1);
      }
      ctx.fillStyle = vignette; ctx.fillRect(0, 0, width, line);
      // Draw white keys first, then shorter black keys above them.
      for (const pitch of keyOrder) {
        const { x, w } = keyRect(pitch), black = blackKey(pitch);
        const keyHeight = black ? blackHeight : whiteHeight;
        const voices = active.get(pitch) ?? 0;
        ctx.fillStyle = black ? blackKeyFill : whiteKey;
        if (black) { ctx.shadowColor = "#00000088"; ctx.shadowBlur = 3; ctx.shadowOffsetY = 2; }
        ctx.fillRect(x + 0.5, line + 2, w - 1, keyHeight);
        ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
        if (voices) {
          const levels = illumination.get(pitch)!;
          for (const voice of [1, 2] as const) if (voices & voice) {
            const colors = PRACTICE_VOICE_COLORS[voice], power = levels[voice - 1];
            const left = x + 0.5 + (voices === 3 && voice === 2 ? (w - 1) / 2 : 0), partWidth = voices === 3 ? (w - 1) / 2 : w - 1;
            ctx.globalAlpha = power; ctx.fillStyle = colors[black ? "blackActive" : "active"]; ctx.fillRect(left, line + 2, partWidth, keyHeight);
            const impact = impacts.get(pitch)?.[voice - 1] ?? 0;
            ctx.globalAlpha = power * (0.25 + 0.75 * impact); ctx.fillStyle = colors.active; ctx.shadowColor = colors.upcoming; ctx.shadowBlur = 4 + 8 * impact; ctx.fillRect(left, line - 1, partWidth, 3); ctx.shadowBlur = 0; ctx.globalAlpha = 1;
          }
        }
        ctx.strokeStyle = black ? "#080a0d" : "#bfc2c8"; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, line + 2, w - 1, keyHeight);
        if (!black) { ctx.fillStyle = "#00000010"; ctx.fillRect(x + 1, line + 5 + keyHeight - 4, w - 2, 3); }
        if (black && !voices) { ctx.fillStyle = "#ffffff15"; ctx.fillRect(x + 2, line + 2 + keyHeight - 8, Math.max(1, w - 4), 2); }
        if (pitch % 12 === 0) {
          ctx.fillStyle = "#656b74"; ctx.font = "11px sans-serif"; ctx.textAlign = "center";
          ctx.fillText(`C${Math.floor(pitch / 12) - 1}`, x + w / 2, height - 10);
        }
      }
      ctx.shadowColor = "#6ed8ff"; ctx.shadowBlur = 5; ctx.fillStyle = "#b3d8ed"; ctx.fillRect(0, line, width, 1); ctx.shadowBlur = 0;
    };
    // Keep the bitmap out of layout. ResizeObserver must not repeatedly clear
    // the canvas in response to scrollbars induced by the canvas itself.
    resize(); draw();
    const observer = new ResizeObserver(() => { resize(); draw(); }); observer.observe(host);
    const fit = () => { resize(); draw(); };
    window.addEventListener?.("resize", fit);
    window.visualViewport?.addEventListener("resize", fit);
    const animate = () => { draw(); animation = requestAnimationFrame(animate); };
    animation = requestAnimationFrame(animate);
    return () => { cancelAnimationFrame(animation); observer.disconnect(); window.removeEventListener?.("resize", fit); window.visualViewport?.removeEventListener("resize", fit); };
  }, [notes, range, canPan]);

  useEffect(() => {
    const host = viewport.current;
    if (host) host.scrollLeft = Math.max(0, (host.scrollWidth - host.clientWidth) / 2);
  }, [range]);

  return <>
  {canPan && <div className="mb-2 flex justify-end gap-1" role="group" aria-label="Visible octaves">
    <button type="button" className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600" aria-label="Show lower octaves" onClick={() => viewport.current?.scrollBy({ left: -viewport.current.clientWidth / 2, behavior: "smooth" })}>← Octaves</button>
    <button type="button" className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600" aria-label="Show higher octaves" onClick={() => viewport.current?.scrollBy({ left: viewport.current.clientWidth / 2, behavior: "smooth" })}>Octaves →</button>
  </div>}
  <div ref={viewport} data-gte-practice-piano-roll="true" className="relative w-full overflow-x-auto overflow-y-hidden rounded-t-lg border border-[#303b49] [&::-webkit-scrollbar]:hidden" style={{ height: "max(96px, calc(100dvh - 376px))", scrollbarWidth: "none", contain: "layout size" }}>
    <canvas ref={canvas} className="absolute left-0 top-0 block" role="img" aria-label="Practice piano roll. Notes fall toward the keyboard. Use octave controls to see other pitches." />
  </div><GtePracticeScrubber {...props} /></>;
}
