import type { ComponentProps } from "react";
import dynamic from "next/dynamic";
import GteWorkspace from "./GteWorkspace";
import { isDrumTrackType } from "../lib/gteDrums";
import { getSnapshotTrackType } from "../lib/gteTrackTypes";

const GteDrumWorkspace = dynamic(() => import("./GteDrumWorkspace"), {
  loading: () => (
    <div className="gte-workspace-loading" role="status" aria-label="Loading drum editor" />
  ),
});
const GteNotationWorkspace = dynamic(() => import("./GteNotationWorkspace"), {
  loading: () => (
    <div className="gte-workspace-loading" role="status" aria-label="Loading notation view" />
  ),
});

type Props = ComponentProps<typeof GteWorkspace>;

const LANE_DELIMITER = "__ed__";

export default function GteTrackWorkspace(props: Props) {
  const trackType = getSnapshotTrackType(props.snapshot);
  if (trackType === "notation") return <GteNotationWorkspace {...props} />;
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
      timingMap={props.timingMap}
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
      showBarNumbers={props.showBarNumbers}
      showTimeRuler={props.showTimeRuler}
      showPlaybackCounter={props.showPlaybackCounter}
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
