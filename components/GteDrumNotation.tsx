import { useMemo, type ComponentProps } from "react";
import type GteWorkspace from "./GteWorkspace";
import GteEngravedScore from "./GteEngravedScore";
import { buildDrumNotationScore } from "../lib/gteDrumNotation";

export default function GteDrumNotation(props: ComponentProps<typeof GteWorkspace>) {
  const score = useMemo(() => buildDrumNotationScore(props.snapshot), [props.snapshot]);
  const seek = (frame: number) => {
    props.onGlobalPlaybackFrameChange?.(frame);
    if (props.practiceMode) props.onPracticeNotePlay?.(frame);
  };
  return <div className="min-w-0 pb-36" style={{ zoom: 0.75 }}>
    <GteEngravedScore score={score} editorId={props.editorId} input={false} disabled={true}
      snapEnabled={true} denominator={8} dotted={false} length={score.framesPerBar / 8}
      cursor={null} selection={{ noteIds: [], chordIds: [] }}
      playbackFrame={props.globalPlaybackFrame ?? 0} playing={Boolean(props.globalPlaybackIsPlaying)}
      getPlaybackFrame={props.getGlobalPlaybackFrame} showBarNumbers={props.showBarNumbers !== false}
      transformPitch={midi => midi} onPoint={point => seek(point.frame)} onSelect={source => seek(source.start)} onMove={() => {}} />
  </div>;
}
