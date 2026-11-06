import type { TranscriberTrack } from "./gteApi";
export function streamingTrackKey(source: { id?: string; trackType?: string; program?: number; name?: string }) {
  if (source.id?.startsWith("user-")) return source.id;
  return source.trackType === "drums" ? "drums" : Number.isInteger(source.program) ? `gm:${source.program}` : `name:${source.name ?? ""}`;
}
export type TranscriptionPreviewMetadata = {
  version: 1; streamId: string; revision: number; processedSeconds: number; durationSeconds: number; complete: boolean; settledSeconds?: number;
};
export type TranscriptionPreviewPayload = TranscriptionPreviewMetadata & { tracks: TranscriberTrack[]; tempoAnalysis?: { bpm?: number; beatsPerBar?: number | null } | null };
export function previewMetadata(value: unknown): TranscriptionPreviewMetadata | null {
  const item = value as TranscriptionPreviewMetadata;
  if (!item || item.version !== 1 || typeof item.streamId !== "string" || item.streamId.length > 160 ||
    !Number.isInteger(item.revision) || item.revision < 1 || !Number.isFinite(item.processedSeconds) || item.processedSeconds < 0 ||
    !Number.isFinite(item.durationSeconds) || item.durationSeconds <= 0 || typeof item.complete !== "boolean") return null;
  return { ...(typeof item.settledSeconds === "number" && Number.isFinite(item.settledSeconds) ? { settledSeconds: Math.max(0, Math.min(item.durationSeconds, item.settledSeconds)) } : {}), version: 1, streamId: item.streamId, revision: item.revision, processedSeconds: item.processedSeconds, durationSeconds: item.durationSeconds, complete: item.complete };
}


/** Look up the actual model tempo in the final job envelope. */
export function streamingModelTempo(value: unknown): { bpm?: number; beatsPerBar?: number } {
  const seen = new Set<object>();
  const find = (item: any, depth: number): { bpm?: number; beatsPerBar?: number } | null => {
    if (!item || typeof item !== "object" || seen.has(item) || depth > 6) return null;
    seen.add(item);
    const tempo = item.tempoAnalysis ?? item.tempo_analysis;
    if (tempo && Number.isFinite(Number(tempo.bpm)) && Number(tempo.bpm) > 0) return { bpm: Number(tempo.bpm), beatsPerBar: Number(tempo.beatsPerBar) || 4 };
    for (const key of ["output", "result", "prediction", "metadata", "meta", "analysis", "transcription", "transcriber"]) { const result = find(item[key], depth + 1); if (result) return result; }
    return null;
  };
  return find(value, 0) ?? {};
}
