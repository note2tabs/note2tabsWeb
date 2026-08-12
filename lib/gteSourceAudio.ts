import { frameToSeconds, secondsToFrame } from "./gteTiming";
import type { TimingMapV2 } from "../types/gte";

export type GteSourceAudioStatus = {
  jobId: string;
  status: "available" | "expired" | "unavailable" | "processing";
  jobStatus?: string | null;
  available: boolean;
  expiresAt?: string | null;
  contentType?: string | null;
  sourceType?: string | null;
  retentionPolicy?: string | null;
  reattachable: boolean;
  playbackOffsetSeconds: number;
  sourceClipStartSeconds: number;
  clipDurationSeconds: number;
  artifactPath?: string | null;
};

export type GteSourceAudioAttachment = {
  sourceJobId: string;
  timelineOffsetFrames: number;
  clipOffsetSeconds: number;
};

export type GteSourceAudioResponse = {
  attachment: GteSourceAudioAttachment | null;
  source: GteSourceAudioStatus | null;
};

const request = async (editorId: string, init?: RequestInit) => {
  const response = await fetch(
    `/api/gte/source-audio/${encodeURIComponent(editorId)}`,
    { cache: "no-store", ...init }
  );
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw Object.assign(
      new Error(
        typeof payload?.error === "string" ? payload.error : "Source audio is unavailable."
      ),
      { status: response.status }
    );
  }
  return payload as GteSourceAudioResponse;
};

export const getGteSourceAudio = (editorId: string) => request(editorId);
export const reattachGteSourceAudio = (editorId: string) =>
  request(editorId, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "reattach" }),
  });
export const attachYoutubeSourceAudio = (
  editorId: string,
  payload: { youtubeUrl: string; timelineOffsetFrames?: number }
) =>
  request(editorId, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      youtubeUrl: payload.youtubeUrl,
      timelineOffsetFrames: payload.timelineOffsetFrames ?? 0,
      startTime: 0,
      duration: 600,
    }),
  });
export const detachGteSourceAudio = (editorId: string) =>
  request(editorId, { method: "DELETE" });

export const sourceAudioSecondsForFrame = (
  timingMap: TimingMapV2,
  frame: number,
  timelineOffsetFrames: number,
  clipOffsetSeconds: number
) =>
  Math.max(
    0,
    frameToSeconds(timingMap, frame) -
      frameToSeconds(timingMap, Math.max(0, Number(timelineOffsetFrames || 0))) +
      Number(clipOffsetSeconds || 0)
  );

export const frameForSourceAudioSeconds = (
  timingMap: TimingMapV2,
  sourceSeconds: number,
  timelineOffsetFrames: number,
  clipOffsetSeconds: number
) =>
  secondsToFrame(
    timingMap,
    Math.max(
      0,
      frameToSeconds(timingMap, Math.max(0, Number(timelineOffsetFrames || 0))) +
        Number(sourceSeconds || 0) -
        Number(clipOffsetSeconds || 0)
    )
  );
