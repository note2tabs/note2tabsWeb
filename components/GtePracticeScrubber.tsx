import { useEffect, useRef, useState, type ComponentProps } from "react";
import { createPortal } from "react-dom";
import type GteWorkspace from "./GteWorkspace";
import { useLocale } from "../lib/i18n/react";

export default function GtePracticeScrubber(props: ComponentProps<typeof GteWorkspace>) {
  const { t } = useLocale();
  const [transport, setTransport] = useState<HTMLElement | null>(null);
  const slider = useRef<HTMLInputElement>(null);
  const dragging = useRef(false);
  const live = useRef(props); live.current = props;
  const end = Math.max(1, props.globalPlaybackTimelineEnd ?? props.snapshot.totalFrames);
  const framesPerBar = Math.max(1, props.snapshot.framesPerMessure || 480);
  const barCount = Math.ceil(end / framesPerBar);
  const tickStride = Math.max(1, Math.ceil(barCount / 240));
  const labelStride = Math.max(tickStride, Math.ceil(barCount / 12));
  useEffect(() => {
    const find = () => setTransport(document.querySelector<HTMLElement>("[data-gte-shared-transport]"));
    find();
    const observer = new MutationObserver(mutations => {
      if (mutations.some(mutation => [...mutation.addedNodes, ...mutation.removedNodes].some(node => node instanceof Element &&
        (node.matches("[data-gte-shared-transport]") || node.querySelector("[data-gte-shared-transport]"))))) find();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!transport) return;
    // Reserve space below the fixed controls for the wider timeline.
    const previousMargin = transport.style.marginBottom;
    transport.style.marginBottom = "3.5rem";
    return () => { transport.style.marginBottom = previousMargin; };
  }, [transport]);
  useEffect(() => {
    if (!transport) return;
    let animation = 0;
    const update = () => {
      const current = live.current;
      const frame = current.getGlobalPlaybackFrame?.() ?? current.globalPlaybackFrame ?? 0;
      if (slider.current && !dragging.current) slider.current.value = String(Math.max(0, Math.min(end, frame)));
      animation = requestAnimationFrame(update);
    };
    update();
    return () => cancelAnimationFrame(animation);
  }, [transport, end]);
  if (!transport) return null;
  return createPortal(<div data-gte-editor-control="true" className="absolute left-1/2 top-full mt-2 -translate-x-1/2 rounded-lg border border-slate-200 bg-white/95 px-3 pb-1 pt-2 shadow-sm" style={{ width: "min(36rem, calc(100vw - 2rem))" }}>
    <input ref={slider} type="range" min={0} max={end} step={1} defaultValue={props.globalPlaybackFrame ?? 0}
      aria-label={t("Song position")} title={t("Seek in song")}
      className="block h-1.5 w-full cursor-pointer accent-emerald-700"
      onKeyDown={event => event.stopPropagation()}
      onPointerDown={event => { dragging.current = true; event.stopPropagation(); }}
      onPointerUp={() => { dragging.current = false; }}
      onPointerCancel={() => { dragging.current = false; }}
      onLostPointerCapture={() => { dragging.current = false; }}
      onBlur={() => { dragging.current = false; }}
      onChange={event => props.onGlobalPlaybackFrameChange?.(Number(event.currentTarget.value))} />
    <div aria-hidden="true" className="relative mx-2 mt-1 h-5 text-[9px] tabular-nums text-slate-500">
      {Array.from({ length: Math.ceil(barCount / tickStride) }, (_, index) => index * tickStride).map(bar => <span key={bar}
        className="absolute top-0 -translate-x-1/2 text-center" style={{ left: `${bar * framesPerBar / end * 100}%` }}>
        <span className="mx-auto block h-1 w-px bg-slate-300" />
        {bar % labelStride === 0 && <span>{bar + 1}</span>}
      </span>)}
    </div>
  </div>, transport);
}
