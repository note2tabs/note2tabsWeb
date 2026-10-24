import { memo, useEffect, type RefObject } from "react";

/** Drive only the playhead DOM from the audio clock, not the drum score render. */
function GteDrumScorePlayback({ root, frame, playing, getFrame, framesPerBar, barsPerRow, rowCount }: {
  root: RefObject<HTMLDivElement | null>; frame: number; playing: boolean; getFrame?: () => number;
  framesPerBar: number; barsPerRow: number; rowCount: number;
}) {
  useEffect(() => {
    const lines = [...(root.current?.querySelectorAll<HTMLDivElement>("[data-drum-score-playhead]") ?? [])];
    let raf = 0, previous = -1;
    const widths = lines.map(line => line.parentElement?.clientWidth ?? 0);
    const measure = () => lines.forEach((line, index) => { widths[index] = line.parentElement?.clientWidth ?? 0; });
    const observer = new ResizeObserver(measure);
    lines.forEach(line => { if (line.parentElement) observer.observe(line.parentElement); });
    const update = () => {
      const current = Math.max(0, getFrame?.() ?? frame), rowFrames = framesPerBar * barsPerRow;
      const index = Math.min(lines.length - 1, Math.floor(current / rowFrames));
      if (previous !== index) {
        if (lines[previous]) lines[previous].style.display = "none";
        if (lines[index]) lines[index].style.display = "";
        previous = index;
      }
      const line = lines[index];
      if (line) {
        const ratio = Math.max(0, Math.min(1, (current - index * rowFrames) / rowFrames));
        // The gutter is 4.5rem; transform keeps animation off the layout path.
        line.style.transform = `translateX(calc(${ratio * widths[index]}px - ${ratio * 4.5}rem))`;
      }
      if (playing) raf = window.requestAnimationFrame(update);
    };
    update();
    return () => { window.cancelAnimationFrame(raf); observer.disconnect(); lines.forEach(line => { line.style.display = "none"; }); };
  }, [root, frame, playing, getFrame, framesPerBar, barsPerRow, rowCount]);
  return null;
}
export default memo(GteDrumScorePlayback);
