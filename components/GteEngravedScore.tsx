import { useEffect, useMemo, useRef, useState } from "react";
import VexFlow, { Renderer } from "vexflow/bravura";
import { engravingPoint, engravingXAt, prepareNotationEngraving, type EngravedHit, type EngravedLayout } from "../lib/gteNotationEngraving";
import { notationPitch, type NotationScore, type ScoreStaff } from "../lib/gteNotationScore";
import { midiAtStep, type ScoreEvent } from "../lib/gteNotation";
import { useLocale } from "../lib/i18n/react";
import GteNotationPlayback from "./GteNotationPlayback";

export type NotationPoint = { frame: number; midi: number; staff: ScoreStaff };
export type NotationSelection = { noteIds: number[]; chordIds: number[] };
const selectedSource = (source: ScoreEvent, selection: NotationSelection) => source.noteId !== undefined ? selection.noteIds.includes(source.noteId) : selection.chordIds.includes(source.chordId!);

export default function GteEngravedScore({ score, input, restInput = false, disabled, snapEnabled, denominator, dotted, length, cursor, selection, playbackFrame, getPlaybackFrame, playing, barsPerSystem, showBarNumbers, transformPitch, onPoint, onSelect, onMove, onAudition, onBoxSelect, onAddBar, editorId, selectedBars = [], onBarSelect, onBarContextMenu, barDragging = false, onBarDragStart, onBarDragEnd, onBarDrop }: {
  score: NotationScore; input: boolean; restInput?: boolean; disabled: boolean; guides?: boolean; snapEnabled: boolean; denominator: number; dotted: boolean; length: number;
  cursor: NotationPoint | null; selection: NotationSelection; playbackFrame: number; playing: boolean; barsPerSystem?: number; showBarNumbers: boolean;
  onPoint: (point: NotationPoint) => void;
  onSelect: (source: ScoreEvent, shift: boolean) => void;
  onMove: (sources: ScoreEvent[], frames: number, semitones: number) => void;
  onAudition?: (midi: number) => void;
  onBoxSelect?: (sources: ScoreEvent[], additive: boolean) => void;
  onAddBar?: () => void;
  getPlaybackFrame?: () => number;
  transformPitch: (midi: number) => number;
  editorId?: string;
  selectedBars?: number[];
  onBarSelect?: (index: number, event: React.MouseEvent<HTMLButtonElement>) => void;
  onBarContextMenu?: (index: number, event: React.MouseEvent<HTMLButtonElement>) => void;
  barDragging?: boolean;
  onBarDragStart?: (index: number, event: React.DragEvent<HTMLButtonElement>) => void;
  onBarDragEnd?: () => void;
  onBarDrop?: (index: number) => void;
}) {
  const { t } = useLocale();
  const hasAddBar = Boolean(onAddBar);
  const container = useRef<HTMLDivElement>(null), host = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0), [layout, setLayout] = useState<EngravedLayout | null>(null), [error, setError] = useState<string | null>(null);
  const [hover, setHover] = useState<NotationPoint | null>(null), [preview, setPreview] = useState<{ sources: ScoreEvent[]; dx: number; dy: number } | null>(null);
  const gesture = useRef<{ x: number; y: number; frame: number; step: number; grabStep: number; midi: number; lastAuditionMidi: number; staff: ScoreStaff; sources: ScoreEvent[]; moved: boolean } | null>(null);
  const overlay = useRef<SVGSVGElement>(null);
  const marquee = useRef<{ x: number; y: number; additive: boolean; moved: boolean } | null>(null);
  const [selectionBox, setSelectionBox] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [barDropIndex, setBarDropIndex] = useState<number | null>(null);
  useEffect(() => { if (!barDragging) setBarDropIndex(null); }, [barDragging]);
  const clearMarquee = () => { marquee.current = null; setSelectionBox(null); };
  useEffect(() => { clearMarquee(); }, [score, input, disabled]);
  useEffect(() => {
    const cancel = (event: KeyboardEvent) => { if (event.key === "Escape" && marquee.current) clearMarquee(); };
    window.addEventListener("keydown", cancel, true);
    return () => window.removeEventListener("keydown", cancel, true);
  }, []);
  const scorePoint = (event: { clientX: number; clientY: number }) => {
    const rect = overlay.current?.getBoundingClientRect();
    if (!rect || !layout || !rect.width || !rect.height) return null;
    return { x: (event.clientX - rect.left) * layout.width / rect.width,
      y: (event.clientY - rect.top) * layout.height / rect.height };
  };
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const measure = () => setWidth(Math.max(280, element.clientWidth));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!width || !host.current) return;
    let cancelled = false;
    const render = async () => {
      try {
        // Embedded, locally bundled Bravura/Academico fonts must be ready before measuring symbols.
        await document.fonts?.ready;
        if (cancelled || !host.current) return;
        const prepared = prepareNotationEngraving(score, Math.max(280, width - (hasAddBar ? 56 : 0)), barsPerSystem);
        if (hasAddBar) prepared.layout.width = Math.max(width, prepared.layout.width + 56);
        host.current.replaceChildren();
        const renderer = new Renderer(host.current, Renderer.Backends.SVG);
        renderer.resize(prepared.layout.width, prepared.layout.height);
        prepared.draw(renderer.getContext());
        const svg = host.current.querySelector("svg");
        svg?.setAttribute("aria-hidden", "true");
        // Keep engraving coordinates and the interaction overlay in the same
        // coordinate system, even when global responsive SVG rules are present.
        svg?.setAttribute("viewBox", `0 0 ${prepared.layout.width} ${prepared.layout.height}`);
        if (svg) {
          svg.style.display = "block";
          svg.style.maxWidth = "none";
          svg.style.width = `${prepared.layout.width}px`;
          svg.style.height = `${prepared.layout.height}px`;
        }
        setLayout(prepared.layout); setError(null);
      } catch (cause) {
        if (!cancelled) { setLayout(null); setError(cause instanceof Error ? cause.message : "The score could not be engraved."); }
      }
    };
    void render();
    return () => { cancelled = true; };
  }, [score, width, barsPerSystem, hasAddBar]);
  useEffect(() => { if (!input || disabled) setHover(null); }, [input, disabled]);
  useEffect(() => { gesture.current = null; setPreview(null); }, [score]);
  useEffect(() => {
    if (!selection.noteIds.length && !selection.chordIds.length) { gesture.current = null; setPreview(null); }
  }, [selection.noteIds.length, selection.chordIds.length]);
  const pointAt = (event: { clientX: number; clientY: number }) => {
    const rect = overlay.current?.getBoundingClientRect();
    if (!rect || !layout) return null;
    const point = engravingPoint(layout, score, (event.clientX - rect.left) * layout.width / rect.width, (event.clientY - rect.top) * layout.height / rect.height, length, snapEnabled);
    return point && { ...point, midi: transformPitch(point.midi) };
  };
  const coordinate = (point: NotationPoint) => {
    if (!layout) return null;
    const position = engravingXAt(layout, score, point.frame);
    if (!position) return null;
    const step = notationPitch(point.midi, score.key).step;
    return { ...position, y: position.measure.staffBottom[point.staff] - (step - (point.staff === "bass" ? 25 : 37)) * 5 };
  };
  const hoverPosition = hover ? coordinate(hover) : null, caret = input && !disabled && cursor ? coordinate(cursor) : null;
  const startDrag = (event: React.PointerEvent<SVGRectElement>, hit: EngravedHit, source: ScoreEvent) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    onSelect(source, event.shiftKey);
    if (disabled || event.shiftKey) return;
    const sources = selectedSource(source, selection) && layout
      ? [...new Map(layout.hits.flatMap((item) => item.token.sources).filter((item) => selectedSource(item, selection)).map((item) => [item.key, item])).values()]
      : [source];
    const point = pointAt(event), rect = overlay.current!.getBoundingClientRect(), position = engravingXAt(layout!, score, source.start)!;
    const y = (event.clientY - rect.top) * layout!.height / rect.height;
    const grabStep = (source.staff === "bass" ? 25 : 37) + Math.round((position.measure.staffBottom[source.staff] - y) / 5);
    gesture.current = { x: event.clientX, y: event.clientY, frame: point?.frame ?? source.start, step: notationPitch(source.midi, score.key).step, grabStep, midi: source.midi, lastAuditionMidi: source.midi, staff: source.staff, sources, moved: false };
    overlay.current?.setPointerCapture(event.pointerId);
    setHover(null);
  };
  const dragTarget = (event: { clientX: number; clientY: number }, active: NonNullable<typeof gesture.current>) => {
    const point = pointAt(event), rect = overlay.current?.getBoundingClientRect();
    if (!point || !rect || !layout) return null;
    const y = (event.clientY - rect.top) * layout.height / rect.height;
    const targetStep = (active.staff === "bass" ? 25 : 37) + Math.round((point.measure.staffBottom[active.staff] - y) / 5);
    const transpose = midiAtStep(active.step + targetStep - active.grabStep) - midiAtStep(active.step);
    const shift = point.frame - active.frame;
    if (active.sources.some((source) => source.midi + transpose < 0 || source.midi + transpose > 127 || source.start + shift < 0)) return null;
    return { transpose, shift, midi: active.midi + transpose, dy: -(targetStep - active.grabStep) * 5,
      dx: (event.clientX - active.x) * layout.width / rect.width };
  };
  const interaction = useRef({ startDrag, onSelect });
  interaction.current = { startDrag, onSelect };
  // Playback/counter updates must not rebuild thousands of static note targets.
  const noteTargets = useMemo(() => layout ? (layout.hits.flatMap((hit) => hit.heads.map((head, index) => {
          const pitch = hit.token.pitches[index], source = pitch.sources[0];
          if (!source) return null;
          const selected = pitch.sources.some((item) => selectedSource(item, selection));
          const moving = preview && pitch.sources.some((item) => preview.sources.some((value) => value.key === item.key));
          return <g key={hit.token.id + ":" + index}>
            {selected && <ellipse cx={head.x + 5} cy={head.y} rx={10} ry={8} fill="#38bdf8" fillOpacity={0.18} stroke="#0284c7" strokeWidth={0.8} pointerEvents="none" />}
            {moving && <ellipse cx={head.x + 5 + preview!.dx} cy={head.y + preview!.dy} rx={6} ry={4} fill="#0284c7" fillOpacity={0.5} pointerEvents="none" />}
            <rect role="button" tabIndex={0} aria-label={pitch.key + " · " + t("Select note")} aria-pressed={selected}
              x={head.x - 4} y={head.y - 7} width={20} height={14} fill="transparent" className="cursor-grab focus:stroke-sky-500 focus:outline-none"
              onPointerDown={(event) => interaction.current.startDrag(event, hit, source)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); event.stopPropagation(); interaction.current.onSelect(source, event.shiftKey); } }} />
          </g>;
        }))) : null, [layout, selection, preview, t]);
  return <div ref={container} className="min-w-0 w-full max-w-full overflow-x-auto">
    {error && <div role="alert" className="mx-5 my-4 rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-700">{t("The score could not be rendered. Your notes are unchanged.")}<details className="mt-2 text-xs"><summary>{t("Details")}</summary>{error}</details></div>}
    <div className="relative bg-white" style={{ width: layout?.width ?? "100%", height: layout?.height ?? 260 }}>
      <div ref={host} />
      {layout && <svg ref={overlay} width={layout.width} height={layout.height} className="absolute inset-0 select-none" style={{ touchAction: disabled ? "pan-y" : "none", cursor: input && !disabled ? "crosshair" : "default" }}
        aria-label={t("Musical score")}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          if (!input && !disabled && onBoxSelect) {
            const point = scorePoint(event);
            if (point) {
              event.preventDefault();
              marquee.current = { ...point, additive: event.shiftKey, moved: false };
              overlay.current?.setPointerCapture(event.pointerId);
            }
            return;
          }
          const point = pointAt(event); if (point) { onPoint(point); setHover(null); }
        }}
        onPointerMove={(event) => {
          if (marquee.current) {
            const start = marquee.current, point = scorePoint(event);
            if (point) {
              if (Math.hypot(point.x - start.x, point.y - start.y) > 4) start.moved = true;
              if (start.moved) setSelectionBox({ x: Math.min(start.x, point.x), y: Math.min(start.y, point.y),
                width: Math.abs(point.x - start.x), height: Math.abs(point.y - start.y) });
            }
            return;
          }
          const active = gesture.current;
          if (active) {
            if (Math.abs(event.clientX - active.x) + Math.abs(event.clientY - active.y) > 4) active.moved = true;
            if (active.moved && !disabled) {
              const target = dragTarget(event, active);
              if (target) {
                setPreview({ sources: active.sources, dx: target.dx, dy: target.dy });
                if (target.midi !== active.lastAuditionMidi) {
                  active.lastAuditionMidi = target.midi;
                  onAudition?.(target.midi);
                }
              }
            }
          } else if (input && !disabled) {
            const point = pointAt(event);
            setHover((previous) => previous?.frame === point?.frame && previous?.midi === point?.midi && previous?.staff === point?.staff ? previous : point);
          }
        }}
        onPointerUp={(event) => {
          if (marquee.current) {
            const start = marquee.current, point = scorePoint(event);
            clearMarquee();
            if (!disabled && !input && point) {
              if (start.moved) {
                const left = Math.min(start.x, point.x), right = Math.max(start.x, point.x);
                const top = Math.min(start.y, point.y), bottom = Math.max(start.y, point.y);
                const sources = layout.hits.flatMap((hit) => hit.heads.flatMap((head, index) =>
                  head.x + 12 >= left && head.x - 2 <= right && head.y + 5 >= top && head.y - 5 <= bottom
                    ? hit.token.pitches[index].sources : []));
                onBoxSelect?.([...new Map(sources.map((source) => [source.key, source])).values()], start.additive);
              } else { const point = pointAt(event); if (point) onPoint(point); }
            }
            return;
          }
          const active = gesture.current; gesture.current = null; setPreview(null);
          if (!active?.moved || disabled) return;
          const target = dragTarget(event, active);
          if (!target) return;
          onMove(active.sources, target.shift, target.transpose);
          onAudition?.(target.midi);
        }}
        onPointerLeave={() => setHover(null)}
        onPointerCancel={() => { clearMarquee(); gesture.current = null; setPreview(null); }}
        onLostPointerCapture={() => { clearMarquee(); gesture.current = null; setPreview(null); }}
        onKeyDown={(event) => { if (event.key === "Escape") { clearMarquee(); gesture.current = null; setPreview(null); } }}>
        {selectionBox && <rect {...selectionBox} data-notation-selection-box="true" fill="#38bdf8" fillOpacity={0.12} stroke="#0284c7" strokeWidth={1} pointerEvents="none" />}
        {layout.measures.filter(measure => selectedBars.includes(measure.index)).map(measure => <rect key={measure.index} data-notation-selected-bar={measure.index}
          x={measure.x} y={measure.top - 2} width={measure.width} height={measure.bottom - measure.top + 4} fill="#10b981" fillOpacity={0.08} stroke="#059669" strokeOpacity={0.45} pointerEvents="none" />)}
        {showBarNumbers && !onBarSelect && layout.measures.map((measure) => <text key={measure.index} x={measure.x + 4} y={measure.top - 8} fontSize={10} fill="#687a70" pointerEvents="none">{measure.index + 1}</text>)}
        {noteTargets}
        {caret && <line x1={caret.x} x2={caret.x} y1={caret.measure.staffBottom[cursor!.staff] - 48} y2={caret.measure.staffBottom[cursor!.staff] + 12} stroke="#059669" strokeWidth={1.4} strokeDasharray="3 3" pointerEvents="none" />}
        {hover && hoverPosition && input && !disabled && <g pointerEvents="none" data-notation-preview="true" opacity={0.65}>
          {restInput ? <text x={hoverPosition.x} y={hoverPosition.y} fontFamily="Bravura" fontSize={40} fill="#059669">{[VexFlow.Glyphs.restWhole, VexFlow.Glyphs.restHalf, VexFlow.Glyphs.restQuarter, VexFlow.Glyphs.rest8th, VexFlow.Glyphs.rest16th, VexFlow.Glyphs.rest32nd, VexFlow.Glyphs.rest64th][Math.log2(denominator)]}</text> : <>
          <ellipse cx={hoverPosition.x + 5} cy={hoverPosition.y} rx={6} ry={4} fill={denominator <= 2 ? "white" : "#059669"} stroke="#059669" transform={`rotate(-20 ${hoverPosition.x + 5} ${hoverPosition.y})`} />
          {denominator > 1 && <line x1={hoverPosition.x + 10} x2={hoverPosition.x + 10} y1={hoverPosition.y} y2={hoverPosition.y - 30} stroke="#059669" strokeWidth={1.4} />}
          {Array.from({ length: Math.max(0, Math.log2(denominator) - 2) }, (_, flag) => <path key={flag} d={`M${hoverPosition.x + 10} ${hoverPosition.y - 30 + flag * 5}q12 7 5 15q2-9-5-11`} fill="#059669" />)}
          {dotted && <circle cx={hoverPosition.x + 18} cy={hoverPosition.y - 2} r={1.6} fill="#059669" />}
          <text x={hoverPosition.x + 18} y={hoverPosition.y - 20} fontSize={10} fill="#216c50">{notationPitch(hover.midi, score.key).key.replace("/", "")}</text>
          </>}
        </g>}
        <GteNotationPlayback layout={layout} score={score} frame={playbackFrame} playing={playing} getFrame={getPlaybackFrame} />
      </svg>}
      {layout && !disabled && onBarSelect && layout.measures.map(measure => {
        const selected = selectedBars.includes(measure.index);
        const insertion = (event: React.DragEvent<HTMLButtonElement>) => {
          const rect = event.currentTarget.getBoundingClientRect();
          return event.clientX - rect.left < rect.width / 2 ? measure.index : measure.index + 1;
        };
        return <button key={measure.index} type="button" aria-label={t("Select bar") + " " + (measure.index + 1)} aria-pressed={selected}
          data-bar-select="true" data-bar-select-editor={editorId} data-bar-index={measure.index} data-gte-editor-control="true"
          title={t("Select bar") + " " + (measure.index + 1)} draggable={selected && Boolean(onBarDragStart)}
          className={`absolute rounded-sm px-1 text-left text-[10px] transition focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-emerald-600 ${selected ? "cursor-grab bg-emerald-100/80 text-emerald-800" : "text-[#687a70] hover:bg-emerald-50"}`}
          style={{ left: measure.x, top: measure.top - 24, width: measure.width, height: 22 }}
          onPointerDown={event => event.stopPropagation()} onClick={event => onBarSelect(measure.index, event)}
          onContextMenu={event => onBarContextMenu?.(measure.index, event)}
          onDragStart={event => onBarDragStart?.(measure.index, event)} onDragEnd={() => { setBarDropIndex(null); onBarDragEnd?.(); }}
          onDragOver={event => { if (barDragging && onBarDrop) { event.preventDefault(); event.dataTransfer.dropEffect = "move"; setBarDropIndex(insertion(event)); } }}
          onDrop={event => { if (barDragging && onBarDrop) { event.preventDefault(); event.stopPropagation(); onBarDrop(insertion(event)); setBarDropIndex(null); } }}>
          {showBarNumbers ? measure.index + 1 : <span className="sr-only">{measure.index + 1}</span>}
        </button>;
      })}
      {layout && !disabled && barDragging && onBarDrop && layout.measures.flatMap((measure, index) => {
        const next = layout.measures[index + 1];
        const boundaries = [{ index: measure.index, x: measure.x }];
        if (!next || next.top !== measure.top) boundaries.push({ index: measure.index + 1, x: measure.x + measure.width });
        return boundaries.map(boundary => <div key={`${measure.index}:${boundary.index}`} data-notation-bar-drop={boundary.index}
          className="absolute z-40" style={{ left: boundary.x - 8, top: measure.top - 24, width: 16, height: measure.bottom - measure.top + 28 }}
          onDragOver={event => { event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = "move"; setBarDropIndex(boundary.index); }}
          onDragLeave={() => setBarDropIndex(current => current === boundary.index ? null : current)}
          onDrop={event => { event.preventDefault(); event.stopPropagation(); setBarDropIndex(null); onBarDrop(boundary.index); }}>
          <div className={`pointer-events-none mx-auto h-full w-0.5 rounded ${barDropIndex === boundary.index ? "bg-emerald-600" : "bg-emerald-400/25"}`} />
        </div>);
      })}
      {layout && onAddBar && !disabled && layout.measures.length > 0 && (() => {
        const last = layout.measures[layout.measures.length - 1];
        return <button type="button" data-gte-editor-control="true" data-gte-floating-ui="true"
          title={t("Add bar to end")} aria-label={t("Add bar to end")}
          onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); onAddBar(); }}
          className="absolute z-40 flex h-10 w-10 items-center justify-center rounded-full border-2 border-white bg-emerald-600 text-2xl font-semibold leading-none text-white shadow-[0_8px_22px_rgba(5,150,105,0.32)] ring-1 ring-emerald-700/30 transition hover:-translate-y-0.5 hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2"
          style={{ left: last.x + last.width + 10, top: (last.top + last.bottom) / 2 - 20 }}>
          <svg viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current" aria-hidden="true"><path d="M12 4v16M4 12h16" strokeWidth={2} strokeLinecap="round" /></svg>
        </button>;
      })()}
    </div>
  </div>;
}
