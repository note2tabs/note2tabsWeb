import { memo, useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode, type CSSProperties } from "react";
import type { EditorSnapshot } from "../types/gte";
import type { PracticeRatingReplay } from "../lib/gtePracticeRating";
import { buildPracticeTabLayout, practiceTabPosition } from "../lib/gtePracticeTabLayout";
import { useLocale } from "../lib/i18n/react";

type Props = {
  snapshot: EditorSnapshot; editorId: string; getFrame: () => number; playing: boolean; active: boolean;
  selectedBars: ReadonlySet<number>; onBarSelect: (bar: number,event: MouseEvent<HTMLButtonElement>) => void;
  onBarRangeSelect?: (start: number,end: number,event: MouseEvent<HTMLButtonElement>) => void;
  onPlayFrom?: (frame: number) => void; showBarNumbers?: boolean;
  focusRange?: { startBar: number; endBar: number } | null; rating?: PracticeRatingReplay | null;
  overlays?: Array<{ key: string; frame: number; content: ReactNode }>;
};

/** Static SVG geometry plus a small imperative playback layer. Audio clock is
 * authoritative: this component never owns, advances or restarts the transport. */
export default memo(function GtePracticeTab(props: Props) {
  const { t } = useLocale();
  const host = useRef<HTMLDivElement>(null), svg = useRef<SVGSVGElement>(null), cursor = useRef<SVGGElement>(null);
  const live = useRef(props); live.current = props;
  const [width,setWidth] = useState(800);
  useEffect(() => {
    const element = host.current; if (!element) return;
    const resize = () => { const next = Math.floor(element.getBoundingClientRect().width); if (next > 0) setWidth(previous => previous === next ? previous : next); };
    resize(); const observer = new ResizeObserver(resize); observer.observe(element);
    return () => observer.disconnect();
  },[]);
  const hasChordOverlays = Boolean(props.overlays?.length);
  const layout = useMemo(() => buildPracticeTabLayout(props.snapshot,width,props.focusRange,hasChordOverlays),[props.snapshot.notes,props.snapshot.chords,props.snapshot.totalFrames,props.snapshot.framesPerMessure,props.snapshot.tuning,props.snapshot.trackType,props.snapshot.editorType,props.snapshot.type,props.focusRange?.startBar,props.focusRange?.endBar,hasChordOverlays,width]);
  const ratings = useMemo(() => new Map(props.rating?.notes.map(note => [note.placementKey,note]) ?? []),[props.rating]);
  const effects = useMemo(() => {
    const byKey = new Map(layout.frets.map(note => [note.key,note]));
    return (props.snapshot.noteEffects ?? []).flatMap(effect => {
      const first = byKey.get(`n:${effect.startNoteId}`), second = byKey.get(`n:${effect.endNoteId}`);
      if (!first || !second || first.string !== second.string) return [];
      const [a,b] = first.start <= second.start ? [first,second] : [second,first];
      const label = effect.noteEffectLabel || (effect.type === 0 ? "b" : effect.type === 1 ? Number(b.label) >= Number(a.label) ? "h" : "p" : Number(b.label) >= Number(a.label) ? "/" : "\\");
      return [{key:`${a.key}:${b.key}`,x:a.row === b.row ? (a.x+b.x)/2 : a.x+a.width/2+9,y:a.y-7,label:label[0]}];
    });
  },[layout,props.snapshot.noteEffects]);

  useEffect(() => {
    const element = svg.current; if (!element) return;
    const nodes = new Map([...element.querySelectorAll<SVGGElement>("[data-practice-fret]")].map(node => [node.dataset.practiceFret!,node]));
    const measures = [...element.querySelectorAll<SVGRectElement>("[data-practice-measure]")];
    // React can reuse SVG nodes with the same note ID after a track/geometry
    // change. Imperative playback attributes must not leak into the new track.
    nodes.forEach(node => node.setAttribute("data-sounding","false"));
    measures.forEach(node => node.setAttribute("fill-opacity","0"));
    const edges = layout.frets.flatMap(note => [{time:note.start,key:note.key,on:true},{time:note.end,key:note.key,on:false}]).sort((a,b) => a.time-b.time || Number(a.on)-Number(b.on));
    const sounding = new Set<string>();
    let edge = 0, previous = -Infinity, previousMeasure = -1, followedRow = -1, raf = 0;
    const illuminate = (key: string,on: boolean) => { nodes.get(key)?.setAttribute("data-sounding",String(on)); if (on) sounding.add(key); else sounding.delete(key); };
    const draw = () => {
      const current = live.current, frame = Math.max(0,current.getFrame());
      if (frame !== previous) {
        if (frame < previous || previous === -Infinity) {
          sounding.forEach(key => nodes.get(key)?.setAttribute("data-sounding","false")); sounding.clear();
          // Binary seek to the first future edge, then restore currently held notes.
          let low = 0,high = edges.length;
          while (low < high) { const mid = (low+high)>>1; if (edges[mid].time <= frame) low = mid+1; else high = mid; }
          edge = low; layout.frets.forEach(note => { if (note.start <= frame && note.end > frame) illuminate(note.key,true); });
        } else while (edge < edges.length && edges[edge].time <= frame) { const change = edges[edge++]; illuminate(change.key,change.on); }
        const position = practiceTabPosition(layout,frame);
        cursor.current?.setAttribute("transform",`translate(${position.x},${position.y})`);
        if (position.index !== previousMeasure) {
          measures[previousMeasure]?.setAttribute("fill-opacity","0"); measures[position.index]?.setAttribute("fill-opacity","0.055"); previousMeasure = position.index;
        }
        if (current.playing && current.active && position.row !== followedRow) {
          followedRow = position.row;
          const rect = host.current?.getBoundingClientRect();
          if (rect) {
            const header = document.querySelector(".gte-editor-sticky-banner")?.getBoundingClientRect();
            const topInset = Math.max(24,header?.bottom ?? 0)+20;
            const transport = document.querySelector("[data-gte-shared-transport]")?.getBoundingClientRect();
            const bottom = transport && transport.top > topInset ? Math.min(window.innerHeight-24,transport.top-20) : window.innerHeight-120;
            const top = rect.top+position.y, end = top+layout.rowHeight;
            // Only follow at system changes. No frame-by-frame scroll commands.
            if (top < topInset || end > bottom) {
              const options: ScrollToOptions = {top:top-topInset,behavior:window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth"};
              const fullscreen = host.current?.closest<HTMLElement>(".gte-practice-fullscreen");
              if (fullscreen && fullscreen.scrollHeight > fullscreen.clientHeight) fullscreen.scrollBy(options);
              else window.scrollBy(options);
            }
          }
        }
        previous = frame;
      }
      raf = requestAnimationFrame(draw);
    };
    draw(); return () => cancelAnimationFrame(raf);
  },[layout]);

  const fretLayer = useMemo(() => layout.frets.map(note => {
        const oldKey = note.key.startsWith("n:") ? `note-${note.key.slice(2)}` : `chord-${note.key.slice(2).replace(":","-")}`;
        const rating = ratings.get(oldKey), color = rating?.status === "missed" ? "#c53e54" : rating?.status === "timing" ? "#8c6414" : rating?.status === "correct" ? "#008558" : undefined;
        return <g key={note.key} data-practice-fret={note.key} style={{"--fret-color":color} as CSSProperties}
          role="button" tabIndex={0} aria-label={t("Play from fret {value1}",{value1:note.label})} onClick={() => live.current.onPlayFrom?.(note.start)} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); live.current.onPlayFrom?.(note.start); } }}>
          <rect x={note.x-note.width/2} y={note.y-8} width={note.width} height="16" fill="#fffefa" />
          <text x={note.x} y={note.y} dominantBaseline="central" textAnchor="middle" fontSize="16" fontWeight="500">{note.label}</text>
        </g>;
      }), [layout, ratings, t]);
  const visibleHeight = layout.stringTop+(layout.labels.length-1)*layout.stringGap;
  return <div ref={host} className="relative min-w-0 bg-[#fffefa]" data-gte-practice-tab="true" data-gte-tab-view="true">
    <svg ref={svg} width="100%" height={layout.height} viewBox={`0 0 ${layout.width} ${layout.height}`} style={{display:"block",fontFamily:"inherit",fontVariantNumeric:"tabular-nums"}} aria-label={t("Tablature")}>
      <style>{`[data-practice-fret] text { fill: var(--fret-color, #1d3028); } [data-practice-fret][data-sounding="true"] text { fill: #008558; font-weight: 700; }`}</style>
      {layout.measures.map((measure,i) => <rect key={i} data-practice-measure={i} x={measure.x} y={measure.row*layout.rowHeight+layout.stringTop-9} width={measure.width} height={visibleHeight-layout.stringTop+18} fill="#07966b" fillOpacity="0" pointerEvents="none" />)}
      {Array.from({length:layout.rowCount},(_,row) => {
        const items = layout.measures.filter(measure => measure.row === row), last = items.at(-1)!;
        return <g key={row} data-practice-system={row}>
          {layout.labels.map((label,string) => {
            const y = row*layout.rowHeight+layout.stringTop+string*layout.stringGap;
            return <g key={string}><text x="21" y={y} dominantBaseline="central" textAnchor="end" fontSize="10" fill="#87928b">{label}</text><line x1="32" x2={last.x+last.width} y1={y} y2={y} stroke="#bdc5bf" strokeWidth="0.65" /></g>;
          })}
          {items.map((measure,i) => <g key={i} opacity={props.focusRange && (measure.bar < props.focusRange.startBar || measure.bar > props.focusRange.endBar) ? 0.3 : 1}>
            <line x1={measure.x} x2={measure.x} y1={row*layout.rowHeight+layout.stringTop} y2={row*layout.rowHeight+visibleHeight} stroke="#7b8980" strokeWidth="1.15" strokeDasharray={measure.continuation ? "2 3" : undefined} />
            {i === items.length-1 ? <line x1={measure.x+measure.width} x2={measure.x+measure.width} y1={row*layout.rowHeight+layout.stringTop} y2={row*layout.rowHeight+visibleHeight} stroke="#7b8980" strokeWidth="1.15" /> : null}
          </g>)}
        </g>;
      })}
      {effects.map(effect => <text key={effect.key} x={effect.x} y={effect.y} textAnchor="middle" fontSize="11" fill="#58685f">{effect.label}</text>)}
      {fretLayer}
      {(props.rating?.falseNotes ?? []).map((note,i) => { const p = practiceTabPosition(layout,note.frame); return <text key={i} x={p.x} y={p.y+layout.stringTop-13} fill="#c53e54" fontSize="12">?</text>; })}
      <g ref={cursor} pointerEvents="none"><line y1={layout.stringTop-12} y2={visibleHeight+12} stroke="#dd5369" strokeWidth="1.7" /><circle cy={layout.stringTop-13} r="2.5" fill="#dd5369" /></g>
    </svg>
    {layout.measures.map((measure,i) => {
      const count = measure.endBar-measure.bar, collapsed = count > 1;
      const label = collapsed ? t("{value1} empty bars",{value1:count}) : `${measure.bar+1}${measure.continuation ? " ↪" : ""}`;
      const range = `${measure.bar+1}${collapsed ? `–${measure.endBar}` : ""}`;
      const selected = Array.from({length:count},(_,offset) => props.selectedBars.has(measure.bar+offset));
      return <button key={i} type="button" data-bar-select="true" data-bar-select-editor={props.editorId} data-bar-index={measure.bar} data-bar-end-index={measure.endBar-1}
      onClick={event => props.onBarRangeSelect ? props.onBarRangeSelect(measure.bar,measure.endBar,event) : props.onBarSelect(measure.bar,event)} aria-label={t("Select {value1}",{value1:collapsed ? `${label} (${range})` : `${t("Bar")} ${range}`})} title={collapsed ? `${t("Bars")} ${range}` : undefined} aria-pressed={selected.every(Boolean) ? true : selected.some(Boolean) ? "mixed" : false}
      className={`absolute h-6 overflow-hidden text-ellipsis whitespace-nowrap rounded-sm text-left text-[11px] hover:bg-emerald-50 focus-visible:outline-emerald-600 ${selected.some(Boolean) ? "bg-emerald-50 text-emerald-800" : "text-slate-500"}`}
      style={{left:measure.x,top:measure.row*layout.rowHeight,width:measure.width,paddingLeft:6}}>{collapsed || props.showBarNumbers !== false ? label : measure.continuation ? "↪" : ""}</button>;
    })}
    {props.overlays?.filter(overlay => overlay.frame >= layout.measures[0].start && overlay.frame < layout.measures.at(-1)!.end).map(overlay => { const p = practiceTabPosition(layout,overlay.frame); return <div key={overlay.key} className="absolute -translate-x-1/2" style={{left:p.x,top:p.y+visibleHeight+12}}>{overlay.content}</div>; })}
  </div>;
});
