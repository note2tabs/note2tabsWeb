import { memo, useEffect, useRef } from "react";
import { engravingXAt, type EngravedLayout } from "../lib/gteNotationEngraving";
import type { NotationScore } from "../lib/gteNotationScore";

const scrollsY = (element: HTMLElement) => /(auto|scroll)/.test(window.getComputedStyle(element).overflowY) && element.scrollHeight > element.clientHeight + 40;
const firstScrollableAncestor = (from: HTMLElement | null) => {
  for (let element = from; element && element !== document.body && element !== document.documentElement; element = element.parentElement) if (scrollsY(element)) return element;
  return null;
};
/** Scroll by `delta`, passing any remainder outward. Wrappers that only overflow by a few px
 * (e.g. overflow-x-auto) must not swallow the scroll meant for the page. */
function scrollBy(from: HTMLElement | null, delta: number) {
  let remaining = delta;
  for (let element = from; element && element !== document.body && element !== document.documentElement && Math.abs(remaining) > 1; element = element.parentElement) {
    if (!scrollsY(element)) continue;
    const before = element.scrollTop, max = element.scrollHeight - element.clientHeight;
    const target = Math.max(0, Math.min(max, before + remaining));
    if (Math.abs(target - before) < 1) continue;
    element.scrollBy({ top: target - before, behavior: "smooth" });
    remaining -= target - before;
  }
  if (Math.abs(remaining) > 1) window.scrollBy({ top: remaining, behavior: "smooth" });
}

/** Animate from the audio clock without rendering the score on every frame. */
function GteNotationPlayback({ layout, score, frame, playing, getFrame }: {
  layout: EngravedLayout; score: NotationScore; frame: number; playing: boolean; getFrame?: () => number;
}) {
  const line = useRef<SVGLineElement>(null), highlights = useRef<SVGGElement>(null);
  const followed = useRef<{ layout: EngravedLayout; top: number } | null>(null);
  const lastScroll = useRef(-Infinity);
  useEffect(() => { if (!playing) followed.current = null; }, [playing]);
  useEffect(() => {
    let raf = 0, previous = "", lastCheck = -Infinity;
    const systems = [...new Map(layout.measures.map(measure => [measure.top, measure])).values()].sort((a,b) => a.top - b.top);
    const nextSystem = new Map(systems.slice(0,-1).map((system,index) => [system.top, systems[index+1]]));
    const byMeasure = new Map<number, typeof layout.hits>();
    // The playhead starts at the staff, not at the top of tall stems/beams.
    // Follow the complete system rather than hiding its upper ink in the banner.
    const systemTops = new Map(systems.map(system => [system.top, system.top - 48]));
    for (const hit of layout.hits) {
      const index = Math.floor(hit.token.tick / score.barTicks);
      const hits = byMeasure.get(index) ?? []; hits.push(hit); byMeasure.set(index, hits);
      const measure = layout.measures[index];
      // Do not use hit.box.y here: VexFlow modifier bounds can retain Y=0
      // before drawing. On later systems that cancels the whole row offset,
      // so follow scrolling keeps targeting the start of the score.
      if (measure) for (const head of hit.heads) {
        systemTops.set(measure.top, Math.min(systemTops.get(measure.top) ?? measure.top - 48, head.y - 64));
      }
    }
    const update = () => {
      const current = getFrame?.() ?? frame;
      const position = engravingXAt(layout, score, current);
      if (line.current) {
        line.current.style.display = position ? "" : "none";
        if (position) {
          line.current.setAttribute("x1", String(position.x)); line.current.setAttribute("x2", String(position.x));
          line.current.setAttribute("y1", String(position.measure.top)); line.current.setAttribute("y2", String(position.measure.bottom));
          if (playing) {
            const now = performance.now();
            const changedSystem = followed.current?.layout !== layout || followed.current.top !== position.measure.top;
            if (changedSystem || now - lastCheck >= 120) {
              lastCheck = now;
              const svg = line.current.ownerSVGElement;
              const svgBounds = svg?.getBoundingClientRect();
              const lineBounds = line.current.getBoundingClientRect();
              // A vertical SVG line can report empty bounds. Measure the score
              // surface and map the row's engraving coordinates into the viewport.
              const scale = svgBounds && svgBounds.height > 0 ? svgBounds.height / layout.height
                : lineBounds.height / Math.max(1, position.measure.bottom - position.measure.top);
              const top = svgBounds && svgBounds.height > 0 ? svgBounds.top + position.measure.top * scale : lineBounds.top;
              const bottom = top + (position.measure.bottom - position.measure.top) * scale;
              if (scale > 0 && Number.isFinite(scale)) {
                const scrollParent = firstScrollableAncestor(svg?.parentElement ?? null);
                const parentBounds = scrollParent?.getBoundingClientRect();
                const headerBottom = document.querySelector(".gte-editor-sticky-banner")?.getBoundingClientRect().bottom ?? 0;
                const viewportTop = Math.max(headerBottom, parentBounds?.top ?? 0) + 16;
                const viewportBottom = Math.min(window.innerHeight, parentBounds?.bottom ?? window.innerHeight) - 112;
                const headroom = (position.measure.top - (systemTops.get(position.measure.top) ?? position.measure.top - 48)) * scale;
                const next = nextSystem.get(position.measure.top);
                const previewBottom = next ? top + (next.bottom - position.measure.top) * scale : bottom;
                const delta = top - headroom - viewportTop;
                const needsScroll = top - headroom < viewportTop - 2 || bottom > viewportBottom || previewBottom > viewportBottom;
                if (needsScroll && Math.abs(delta) > 2 && (changedSystem || now - lastScroll.current >= 800)) {
                  scrollBy(svg?.parentElement ?? null, delta);
                  lastScroll.current = now;
                }
                followed.current = { layout, top: position.measure.top };
              }
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
