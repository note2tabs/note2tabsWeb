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

