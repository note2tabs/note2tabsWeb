import { memo, useEffect, useRef } from "react";
import { engravingXAt, type EngravedLayout } from "../lib/gteNotationEngraving";
import type { NotationScore } from "../lib/gteNotationScore";

/** Animate from the audio clock without rendering the score on every frame. */
function GteNotationPlayback({ layout, score, frame, playing, getFrame }: {
  layout: EngravedLayout; score: NotationScore; frame: number; playing: boolean; getFrame?: () => number;
}) {
  const line = useRef<SVGLineElement>(null), highlights = useRef<SVGGElement>(null);
  const followed = useRef<{ layout: EngravedLayout; top: number } | null>(null);
  useEffect(() => { if (!playing) followed.current = null; }, [playing]);
  useEffect(() => {
    let raf = 0, previous = "";
    const systems = [...new Map(layout.measures.map(measure => [measure.top, measure])).values()].sort((a,b) => a.top - b.top);
    const nextSystem = new Map(systems.slice(0,-1).map((system,index) => [system.top, systems[index+1]]));
    const byMeasure = new Map<number, typeof layout.hits>();
    for (const hit of layout.hits) {
      const index = Math.floor(hit.token.tick / score.barTicks);
      const hits = byMeasure.get(index) ?? []; hits.push(hit); byMeasure.set(index, hits);
    }
    const update = () => {
      const current = getFrame?.() ?? frame;
      const position = engravingXAt(layout, score, current);
      if (line.current) {
        line.current.style.display = position ? "" : "none";
        if (position) {
          line.current.setAttribute("x1", String(position.x)); line.current.setAttribute("x2", String(position.x));
          line.current.setAttribute("y1", String(position.measure.top)); line.current.setAttribute("y2", String(position.measure.bottom));
          if (playing && (followed.current?.layout !== layout || followed.current.top !== position.measure.top)) {
            followed.current = { layout, top: position.measure.top };
            const bounds = line.current.getBoundingClientRect();
            const headerBottom = document.querySelector(".gte-editor-sticky-banner")?.getBoundingClientRect().bottom ?? 0;
            const next = nextSystem.get(position.measure.top);
            const scale = bounds.height / Math.max(1, position.measure.bottom - position.measure.top);
            const previewBottom = next ? bounds.top + (next.bottom - position.measure.top) * scale : bounds.bottom;
            if (bounds.height > 0 && (bounds.top < headerBottom + 16 || bounds.bottom > window.innerHeight - 112 || previewBottom > window.innerHeight - 112)) {
              // Advance once per system, keeping the current system near the
              // top so the player can read the next one before reaching it.
              line.current.style.scrollMarginTop = `${headerBottom + 16}px`;
              line.current.scrollIntoView({ block: "start", inline: "nearest", behavior: "smooth" });
            }
          }
        }
      }
      const sounding = playing && position ? (byMeasure.get(position.measure.index) ?? []).flatMap((hit) =>
        hit.heads.flatMap((head, index) => hit.token.pitches[index].sources.some((source) => current >= source.start && current < source.start + source.length)
          ? [{ key: hit.token.id + ":" + index, x: head.x + 5 * (hit.scaleX ?? 1), y: head.y, scaleX: hit.scaleX ?? 1 }] : [])) : [];
      const signature = sounding.map((head) => head.key).join("|");
      if (signature !== previous || !playing) {
        previous = signature;
        highlights.current?.replaceChildren(...sounding.map((head) => {
          const ellipse = document.createElementNS("http://www.w3.org/2000/svg", "ellipse");
          for (const [key, value] of Object.entries({ cx: head.x, cy: head.y, rx: 10 * head.scaleX, ry: 8, fill: "#34d399", "fill-opacity": 0.18, stroke: "#059669", "stroke-width": 0.8 })) ellipse.setAttribute(key, String(value));
          return ellipse;
        }));
      }
      if (playing) raf = window.requestAnimationFrame(update);
    };
    update();
    return () => window.cancelAnimationFrame(raf);
  }, [layout, score, frame, playing, getFrame]);
  return <g pointerEvents="none" aria-hidden="true" data-notation-playback="true">
    <g ref={highlights} /><line ref={line} stroke="#d6556b" strokeWidth={1.4} />
  </g>;
}
export default memo(GteNotationPlayback);
