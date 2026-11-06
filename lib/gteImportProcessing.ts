import type { CanvasSnapshot, TimingMapV2 } from "../types/gte";
import type { TranscriberTrack, TranscriberQuantization } from "./gteApi";
import { restoreNotationSnapshot } from "./gteNotationPersistence";
import { importedInstrument } from "./gteImportedInstrument";
import { restorePitchedImport } from "./gteNotationImport";
import { scaleImportedLane } from "./gteImportRhythm";
import { generatePlayingCoordinatesInSnapshot } from "./gtePlayingCoordinates";
import { cleanTinyOverlapsInSnapshot } from "./gteOverlapCleanup";
import { isNotationTrack } from "./gteNotation";
import { assignVoices } from "./gteAssignVoices";
import { detectImportedKey } from "./gteImportedKey";
import { finalizeOptimizedTrackFingeringInSnapshot, mergeRedundantCutRegionsInSnapshot, optimizeTrackFingeringInSnapshot } from "./gteFingeringOptimization";

export { TRANSCRIBER_FINGERING_OPTIMIZATION_PASSES } from "./gteImportPolicy";
export type ImportedProcessingContext = { timingMap?: TimingMapV2; quantization?: TranscriberQuantization; rhythmScale?: number; preferredTimingMap?: TimingMapV2; preserveMusic?: boolean };
const isDrumLane = (lane: CanvasSnapshot["editors"][number]) => ["drum", "drums"].includes(lane.trackType ?? lane.editorType ?? lane.type ?? "");

/** Canonical final import transform, shared by ordinary and streamed imports. */
export function processImportedCanvas(canvas: CanvasSnapshot, passes: number = 1, importedEditorIds?: readonly string[], importedTracks?: readonly TranscriberTrack[], importContext?: ImportedProcessingContext, overlapCleanupOptions: { manual?: boolean } = { manual: true }): CanvasSnapshot {
  const optimized = JSON.parse(JSON.stringify(canvas)) as CanvasSnapshot;
  const importedLaneIds = importedEditorIds ? new Set(importedEditorIds) : null;
  optimized.editors = optimized.editors.map(lane => (!importedLaneIds || importedLaneIds.has(lane.id)) && lane.notation === undefined && lane.chordEditor?.notation ? restoreNotationSnapshot(lane) : lane);

  for (const [index, laneId] of (importedEditorIds ?? []).entries()) {
    const source = importedTracks?.[index];
    const lane = optimized.editors.find(item => item.id === laneId);
    if (!source || !lane) continue;
    const instrument = importedInstrument(source);
    Object.assign(lane, instrument, { name: source.name, ...(Number.isInteger(source.program) && source.program! >= 0 && source.program! <= 127 ? { program: source.program } : {}), chordEditor: { ...lane.chordEditor, instrumentType: instrument.instrumentType, instrumentSound: instrument.instrumentId } });
    if (instrument.instrumentType === "notation") Object.assign(lane, restorePitchedImport(lane, source.segments, importContext?.timingMap ?? optimized.timingMap, importContext?.quantization));
  }

  if (importContext?.preferredTimingMap && importContext.rhythmScale && importContext.rhythmScale !== 1) {
    const map = importContext.preferredTimingMap, secondsPerBar = map.bars[0].endSeconds - map.bars[0].startSeconds;
    optimized.timingMap = map; optimized.secondsPerBar = secondsPerBar;
    optimized.editors = optimized.editors.map(lane => !importedLaneIds?.size || importedLaneIds.has(lane.id) ? scaleImportedLane(lane, importContext.rhythmScale!, secondsPerBar) : lane);
  }

  optimized.editors.forEach((lane) => {
    if (importedLaneIds && !importedLaneIds.has(lane.id)) return;
    if (importContext?.preserveMusic) return;
    if (isNotationTrack(lane)) {
      if (importedLaneIds?.has(lane.id)) cleanTinyOverlapsInSnapshot(lane, overlapCleanupOptions);
      return;
    }
    if (
      isDrumLane(lane) ||
      !Array.isArray(lane.notes) ||
      !Array.isArray(lane.chords) ||
      (lane.notes.length === 0 && lane.chords.length === 0)
    ) return;
    if (importedLaneIds?.has(lane.id)) {
      cleanTinyOverlapsInSnapshot(lane, overlapCleanupOptions);
    }
    const passCount = Math.max(1, Math.floor(passes));
    for (let pass = 0; pass < passCount; pass += 1) {
      generatePlayingCoordinatesInSnapshot(lane);
      optimizeTrackFingeringInSnapshot(lane);
      finalizeOptimizedTrackFingeringInSnapshot(lane);
      mergeRedundantCutRegionsInSnapshot(lane);
    }
    if (importedLaneIds?.has(lane.id)) cleanTinyOverlapsInSnapshot(lane, overlapCleanupOptions);
  });

  // Detect once from the complete source, not incremental preview guesses. An
  // append must not replace the established key of an existing arrangement.
  if (importedTracks?.length && importedLaneIds?.size === optimized.editors.length) {
    const key = detectImportedKey(importedTracks);
    if (key) { optimized.keyBase = key.keyBase; optimized.keyType = key.keyType; }
  }

  // Every import format converges here after final timing, cleanup and fingering.
  optimized.editors = optimized.editors.map(lane => importedLaneIds && !importedLaneIds.has(lane.id) || isDrumLane(lane)
    ? lane : assignVoices({ track: lane }).track);
  return optimized;
}
