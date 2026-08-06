import type { ComponentProps } from "react";
import GteWorkspace from "./GteWorkspace";
import GteDrumWorkspace from "./GteDrumWorkspace";
import { isDrumTrackType } from "../lib/gteDrums";

type Props = ComponentProps<typeof GteWorkspace>;

const LANE_DELIMITER = "__ed__";

export default function GteTrackWorkspace(props: Props) {
  const trackType =
    props.snapshot.editorType ?? props.snapshot.trackType ?? props.snapshot.type;
  if (!isDrumTrackType(trackType)) return <GteWorkspace {...props} />;

  const delimiterIndex = props.editorId.indexOf(LANE_DELIMITER);
  const canvasId =
    delimiterIndex >= 0
      ? props.editorId.slice(0, delimiterIndex)
      : props.editorId;
  const laneId =
    delimiterIndex >= 0
      ? props.editorId.slice(delimiterIndex + LANE_DELIMITER.length)
      : props.snapshot.id;

  return (
    <GteDrumWorkspace
      canvasId={canvasId}
      laneId={laneId}
      snapshot={props.snapshot}
      onSnapshotChange={props.onSnapshotChange}
      isActive={Boolean(props.isActive)}
      mobileViewport={props.mobileViewport}
      onFocusWorkspace={props.onFocusWorkspace}
      editMenuPortalTarget={props.editMenuPortalTarget}
      onEditMenuPointerEnter={props.onEditMenuPointerEnter}
      onEditMenuPointerLeave={props.onEditMenuPointerLeave}
      onSelectionStateChange={props.onSelectionStateChange}
      barSelectionClearEpoch={props.barSelectionClearEpoch}
      barSelectionClearExemptEditorId={props.barSelectionClearExemptEditorId}
      onBarSelectionStateChange={props.onBarSelectionStateChange}
      onRequestSelectedBarsCopy={props.onRequestSelectedBarsCopy}
      onRequestSelectedBarsPaste={props.onRequestSelectedBarsPaste}
      onRequestSelectedBarsDelete={props.onRequestSelectedBarsDelete}
      barClipboardAvailable={props.barClipboardAvailable}
      activeBarDrag={props.activeBarDrag}
      onBarDragStart={props.onBarDragStart}
      onBarDragEnd={props.onBarDragEnd}
      onRequestBarDrop={props.onRequestBarDrop}
      sharedViewportBarCount={props.sharedViewportBarCount}
      sharedTimelineScrollRatio={props.sharedTimelineScrollRatio}
      onSharedTimelineScrollRatioChange={props.onSharedTimelineScrollRatioChange}
      sharedTimelineBaseScale={props.sharedTimelineBaseScale}
      timelineZoomFactor={props.timelineZoomFactor}
      snapSubdivisionsPerBeat={props.snapSubdivisionsPerBeat}
      globalSnapToGridEnabled={props.globalSnapToGridEnabled}
      globalPlaybackFrame={props.globalPlaybackFrame}
      getGlobalPlaybackFrame={props.getGlobalPlaybackFrame}
      globalPlaybackIsPlaying={props.globalPlaybackIsPlaying}
      globalPlaybackIsPreparing={props.globalPlaybackIsPreparing}
      globalPlaybackVolume={props.globalPlaybackVolume}
      playbackUiVisible={props.playbackUiVisible}
      onGlobalPlaybackToggle={props.onGlobalPlaybackToggle}
      onGlobalPlaybackVolumeChange={props.onGlobalPlaybackVolumeChange}
      onGlobalPlaybackFrameChange={props.onGlobalPlaybackFrameChange}
    />
  );
}
