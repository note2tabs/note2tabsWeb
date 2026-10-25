import { useEffect, useRef, type ComponentProps } from "react";
import type GteWorkspace from "./GteWorkspace";
import { useLocale } from "../lib/i18n/react";

/** Bare, full-width seek strip attached to the keyboard, not the transport. */
export default function GtePracticeScrubber(props: ComponentProps<typeof GteWorkspace>) {
  const { t } = useLocale();
  const slider = useRef<HTMLInputElement>(null);
  const dragging = useRef(false);
  const live = useRef(props); live.current = props;
  const end = Math.max(1, props.globalPlaybackTimelineEnd ?? props.snapshot.totalFrames);
  useEffect(() => {
    let animation = 0;
    const update = () => {
      const current = live.current;
      const frame = current.getGlobalPlaybackFrame?.() ?? current.globalPlaybackFrame ?? 0;
      if (slider.current && !dragging.current) {
        slider.current.value = String(Math.max(0, Math.min(end, frame)));
        slider.current.style.setProperty("--seek-progress", `${Math.max(0, Math.min(100, frame / end * 100))}%`);
      }
      animation = requestAnimationFrame(update);
    };
    update();
    return () => cancelAnimationFrame(animation);
  }, [end]);
  return <div data-gte-editor-control="true" className="flex h-5 items-center rounded-b-lg border border-t-0 border-[#303b49] bg-[#161d27] px-1.5">
    <input ref={slider} type="range" min={0} max={end} step={1} defaultValue={props.globalPlaybackFrame ?? 0}
      aria-label={t("Song position")} className="gte-practice-seek w-full"
      onKeyDown={event => event.stopPropagation()}
      onPointerDown={event => { dragging.current = true; event.stopPropagation(); }}
      onPointerUp={() => { dragging.current = false; }} onPointerCancel={() => { dragging.current = false; }}
      onLostPointerCapture={() => { dragging.current = false; }} onBlur={() => { dragging.current = false; }}
      onChange={event => {
        const value = Number(event.currentTarget.value);
        event.currentTarget.style.setProperty("--seek-progress", `${value / end * 100}%`);
        props.onGlobalPlaybackFrameChange?.(value);
      }} />
  </div>;
}
