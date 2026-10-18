import { useEffect, useRef, useState } from "react";
import { Renderer } from "vexflow/bravura";
import { engravingPoint, engravingXAt, prepareNotationEngraving, type EngravedHit, type EngravedLayout } from "../lib/gteNotationEngraving";
import { notationPitch, type NotationScore, type ScoreStaff } from "../lib/gteNotationScore";
import { midiAtStep, type ScoreEvent } from "../lib/gteNotation";
import { useLocale } from "../lib/i18n/react";

export type NotationPoint = { frame: number; midi: number; staff: ScoreStaff };
export type NotationSelection = { noteIds: number[]; chordIds: number[] };
const selectedSource = (source: ScoreEvent, selection: NotationSelection) => source.noteId !== undefined ? selection.noteIds.includes(source.noteId) : selection.chordIds.includes(source.chordId!);

export default function GteEngravedScore({ score, input, disabled, guides, snapEnabled, denominator, dotted, length, cursor, selection, playbackFrame, playing, barsPerSystem, showBarNumbers, transformPitch, onPoint, onSelect, onMove }: {
  score: NotationScore; input: boolean; disabled: boolean; guides: boolean; snapEnabled: boolean; denominator: number; dotted: boolean; length: number;
  cursor: NotationPoint | null; selection: NotationSelection; playbackFrame: number; playing: boolean; barsPerSystem: number; showBarNumbers: boolean;
  onPoint: (point: NotationPoint) => void;
  onSelect: (source: ScoreEvent, shift: boolean) => void;
  onMove: (sources: ScoreEvent[], frames: number, semitones: number) => void;
  transformPitch: (midi: number) => number;
}) {
  const { t } = useLocale();
  const container = useRef<HTMLDivElement>(null), host = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0), [layout, setLayout] = useState<EngravedLayout | null>(null), [error, setError] = useState<string | null>(null);
  const [hover, setHover] = useState<NotationPoint | null>(null), [preview, setPreview] = useState<{ sources: ScoreEvent[]; dx: number; dy: number } | null>(null);
  const gesture = useRef<{ x: number; y: number; frame: number; step: number; grabStep: number; staff: ScoreStaff; sources: ScoreEvent[]; moved: boolean } | null>(null);
  const overlay = useRef<SVGSVGElement>(null);
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
        const prepared = prepareNotationEngraving(score, width, barsPerSystem);
        host.current.replaceChildren();
        const renderer = new Renderer(host.current, Renderer.Backends.SVG);
        renderer.resize(prepared.layout.width, prepared.layout.height);
        prepared.draw(renderer.getContext());
        const svg = host.current.querySelector("svg");
        svg?.setAttribute("aria-hidden", "true");
        setLayout(prepared.layout); setError(null);
      } catch (cause) {
        if (!cancelled) { setLayout(null); setError(cause instanceof Error ? cause.message : "The score could not be engraved."); }
      }
    };
    void render();
    return () => { cancelled = true; };
  }, [score, width, barsPerSystem]);
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
  const playhead = layout ? engravingXAt(layout, score, playbackFrame) : null;
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
    gesture.current = { x: event.clientX, y: event.clientY, frame: point?.frame ?? source.start, step: notationPitch(source.midi, score.key).step, grabStep, staff: source.staff, sources, moved: false };
    overlay.current?.setPointerCapture(event.pointerId);
    setHover(null);
  };
  return <div ref={container} className="w-full overflow-x-auto">
    {error && <div role="alert" className="mx-5 my-4 rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-700">{t("The score could not be rendered. Your notes are unchanged.")}<details className="mt-2 text-xs"><summary>{t("Details")}</summary>{error}</details></div>}
    <div className="relative bg-white" style={{ width: layout?.width ?? "100%", height: layout?.height ?? 260 }}>
      <div ref={host} />
      {layout && <svg ref={overlay} width={layout.width} height={layout.height} className="absolute inset-0 select-none" style={{ touchAction: disabled ? "pan-y" : "none", cursor: input && !disabled ? "crosshair" : "default" }}
        aria-label={t("Musical score")}
        onPointerDown={(event) => { if (event.button !== 0) return; const point = pointAt(event); if (point) { onPoint(point); setHover(null); } }}
        onPointerMove={(event) => {
          const active = gesture.current;
          if (active) {
            if (Math.abs(event.clientX - active.x) + Math.abs(event.clientY - active.y) > 4) active.moved = true;
            if (active.moved) setPreview({ sources: active.sources, dx: event.clientX - active.x, dy: Math.round((event.clientY - active.y) / 5) * 5 });
          } else if (input && !disabled) {
            const point = pointAt(event);
            setHover((previous) => previous?.frame === point?.frame && previous?.midi === point?.midi && previous?.staff === point?.staff ? previous : point);
          }
        }}
        onPointerUp={(event) => {
          const active = gesture.current; gesture.current = null; setPreview(null);
          if (!active?.moved || disabled) return;
          const point = pointAt(event);
          if (!point) return;
          const rect = overlay.current!.getBoundingClientRect();
          const y = (event.clientY - rect.top) * layout.height / rect.height;
          const targetStep = (active.staff === "bass" ? 25 : 37) + Math.round((point.measure.staffBottom[active.staff] - y) / 5);
          onMove(active.sources, point.frame - active.frame, midiAtStep(active.step + targetStep - active.grabStep) - midiAtStep(active.step));
        }}
        onPointerLeave={() => setHover(null)}
        onPointerCancel={() => { gesture.current = null; setPreview(null); }}
        onLostPointerCapture={() => { gesture.current = null; setPreview(null); }}
        onKeyDown={(event) => { if (event.key === "Escape") { gesture.current = null; setPreview(null); } }}>
        {showBarNumbers && layout.measures.map((measure) => <text key={measure.index} x={measure.x + 4} y={measure.top - 8} fontSize={10} fill="#687a70" pointerEvents="none">{measure.index + 1}</text>)}
        {layout.hits.flatMap((hit) => hit.heads.map((head, index) => {
          const pitch = hit.token.pitches[index], source = pitch.sources[0];
          if (!source) return null;
          const selected = pitch.sources.some((item) => selectedSource(item, selection));
          const sounding = playing && pitch.sources.some((item) => playbackFrame >= item.start && playbackFrame < item.start + item.length);
          const moving = preview && pitch.sources.some((item) => preview.sources.some((value) => value.key === item.key));
          return <g key={hit.token.id + ":" + index}>
            {(selected || sounding) && <ellipse cx={head.x + 5} cy={head.y} rx={10} ry={8} fill={selected ? "#38bdf8" : "#34d399"} fillOpacity={0.18} stroke={selected ? "#0284c7" : "#059669"} strokeWidth={0.8} pointerEvents="none" />}
            {moving && <ellipse cx={head.x + 5 + preview!.dx} cy={head.y + preview!.dy} rx={6} ry={4} fill="#0284c7" fillOpacity={0.5} pointerEvents="none" />}
            <rect role="button" tabIndex={0} aria-label={pitch.key + " · " + t("Select note")} aria-pressed={selected}
              x={head.x - 4} y={head.y - 7} width={20} height={14} fill="transparent" className="cursor-grab focus:stroke-sky-500 focus:outline-none"
              onPointerDown={(event) => startDrag(event, hit, source)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); event.stopPropagation(); onSelect(source, event.shiftKey); } }} />
          </g>;
        }))}
        {caret && <line x1={caret.x} x2={caret.x} y1={caret.measure.staffBottom[cursor!.staff] - 48} y2={caret.measure.staffBottom[cursor!.staff] + 12} stroke="#059669" strokeWidth={1.4} strokeDasharray="3 3" pointerEvents="none" />}
        {hover && hoverPosition && input && !disabled && <g pointerEvents="none" data-notation-preview="true" opacity={0.65}>
          {guides && Array.from({ length: score.numerator }, (_, beat) => {
            const position = engravingXAt(layout, score, (hoverPosition.measure.index + beat / score.numerator) * score.framesPerBar);
            return position && <line key={beat} x1={position.x} x2={position.x} y1={hoverPosition.measure.staffBottom[hover.staff] - 45} y2={hoverPosition.measure.staffBottom[hover.staff] + 10} stroke="#b4c7bd" strokeDasharray="2 4" />;
          })}
          <ellipse cx={hoverPosition.x + 5} cy={hoverPosition.y} rx={6} ry={4} fill={denominator <= 2 ? "white" : "#059669"} stroke="#059669" transform={`rotate(-20 ${hoverPosition.x + 5} ${hoverPosition.y})`} />
          {denominator > 1 && <line x1={hoverPosition.x + 10} x2={hoverPosition.x + 10} y1={hoverPosition.y} y2={hoverPosition.y - 30} stroke="#059669" strokeWidth={1.4} />}
          {Array.from({ length: Math.max(0, Math.log2(denominator) - 2) }, (_, flag) => <path key={flag} d={`M${hoverPosition.x + 10} ${hoverPosition.y - 30 + flag * 5}q12 7 5 15q2-9-5-11`} fill="#059669" />)}
          {dotted && <circle cx={hoverPosition.x + 18} cy={hoverPosition.y - 2} r={1.6} fill="#059669" />}
          <text x={hoverPosition.x + 18} y={hoverPosition.y - 20} fontSize={10} fill="#216c50">{notationPitch(hover.midi, score.key).key.replace("/", "")}</text>
        </g>}
        {playhead && <line x1={playhead.x} x2={playhead.x} y1={playhead.measure.top} y2={playhead.measure.bottom} stroke="#d6556b" strokeWidth={1.4} pointerEvents="none" />}
      </svg>}
    </div>
  </div>;
}
