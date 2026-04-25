export type StoredTranscriberSegment = {
  start_time_s?: number;
  end_time_s?: number;
  pitch_midi?: number;
  amplitude?: number | null;
  pitch_bend?: number[] | null;
  lineStart?: number;
  lineEnd?: number;
  midiNum?: number | null;
  MidiNumLine?: number[];
};

export type StoredTranscriberSegmentGroup = StoredTranscriberSegment[];

export type StoredArtifactReference = {
  storage?: string | null;
  localPath?: string | null;
  objectKey?: string | null;
  gcsKey?: string | null;
  s3Key?: string | null;
  fileName?: string | null;
  contentType?: string | null;
};

export type StoredReviewParams = {
  onsetThresh?: number;
  frameThresh?: number;
  minNoteLen?: number;
  minFreq?: number;
  maxFreq?: number;
};

export type StoredReviewState = {
  params?: StoredReviewParams | null;
  noteEventCount?: number | null;
  artifacts?: {
    prediction?: StoredArtifactReference | null;
    noteEvents?: StoredArtifactReference | null;
    previewAudio?: StoredArtifactReference | null;
  } | null;
};

export type StoredTabPayload = {
  tabs: string[][];
  transcriberSegments: StoredTranscriberSegmentGroup[];
  backendJobId?: string | null;
  multipleGuitars?: boolean | null;
  review?: StoredReviewState | null;
};

function normalizeTabSegments(value: unknown): string[][] {
  if (!Array.isArray(value)) return [];
  return value
    .map((segment) =>
      Array.isArray(segment)
        ? segment.filter((line): line is string => typeof line === "string" && line.trim().length > 0)
        : []
    )
    .filter((segment) => segment.length > 0);
}

function normalizeTranscriberSegment(value: unknown): StoredTranscriberSegment | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if ("start_time_s" in record || "end_time_s" in record || "pitch_midi" in record) {
    const startTime = Number(record.start_time_s);
    const endTime = Number(record.end_time_s);
    const pitchMidi = Number(record.pitch_midi);
    if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || !Number.isFinite(pitchMidi)) return null;
    const rawPitchBend = Array.isArray(record.pitch_bend)
      ? record.pitch_bend
          .map((entry) => Number(entry))
          .filter((entry) => Number.isFinite(entry))
          .map((entry) => Math.round(entry))
      : null;
    const amplitude =
      record.amplitude === null || record.amplitude === undefined
        ? null
        : Number.isFinite(Number(record.amplitude))
        ? Number(record.amplitude)
        : null;
    return {
      start_time_s: Math.max(0, Number(startTime)),
      end_time_s: Math.max(Number(startTime), Number(endTime)),
      pitch_midi: Math.round(Number(pitchMidi)),
      amplitude,
      pitch_bend: rawPitchBend,
    };
  }
  const lineStart = Number(record.lineStart);
  const lineEnd = Number(record.lineEnd);
  const midiNumLine = Array.isArray(record.MidiNumLine)
    ? record.MidiNumLine
        .map((entry) => Number(entry))
        .filter((entry) => Number.isFinite(entry))
        .map((entry) => Math.round(entry))
    : [];
  const midiNum =
    record.midiNum === null || record.midiNum === undefined
      ? null
      : Number.isFinite(Number(record.midiNum))
      ? Math.round(Number(record.midiNum))
      : null;
  if (!Number.isFinite(lineStart) || !Number.isFinite(lineEnd)) return null;
  if (midiNumLine.length === 0 && midiNum === null) return null;
  return {
    lineStart: Math.max(0, Math.round(lineStart)),
    lineEnd: Math.max(Math.round(lineStart), Math.round(lineEnd)),
    midiNum,
    MidiNumLine: midiNumLine.length > 0 ? midiNumLine : midiNum !== null ? [midiNum] : [],
  };
}

function normalizeTranscriberSegments(value: unknown): StoredTranscriberSegmentGroup[] {
  if (!Array.isArray(value)) return [];
  const directGroup = value
    .map((segment) => normalizeTranscriberSegment(segment))
    .filter((segment): segment is StoredTranscriberSegment => Boolean(segment));
  if (directGroup.length > 0) {
    return [directGroup];
  }
  return value
    .map((group) => {
      if (!Array.isArray(group)) return [];
      return group
        .map((segment) => normalizeTranscriberSegment(segment))
        .filter((segment): segment is StoredTranscriberSegment => Boolean(segment));
    })
    .filter((group) => group.length > 0);
}

function normalizeArtifactReference(value: unknown): StoredArtifactReference | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const normalized: StoredArtifactReference = {
    storage: typeof record.storage === "string" && record.storage.trim() ? record.storage : null,
    localPath: typeof record.localPath === "string" && record.localPath.trim() ? record.localPath : null,
    objectKey: typeof record.objectKey === "string" && record.objectKey.trim() ? record.objectKey : null,
    gcsKey: typeof record.gcsKey === "string" && record.gcsKey.trim() ? record.gcsKey : null,
    s3Key: typeof record.s3Key === "string" && record.s3Key.trim() ? record.s3Key : null,
    fileName: typeof record.fileName === "string" && record.fileName.trim() ? record.fileName : null,
    contentType: typeof record.contentType === "string" && record.contentType.trim() ? record.contentType : null,
  };
  if (Object.values(normalized).every((value) => value === null || value === undefined || value === "")) {
    return null;
  }
  return normalized;
}

function normalizeReviewParams(value: unknown): StoredReviewParams | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const normalized: StoredReviewParams = {};
  const onsetThresh = Number(record.onsetThresh);
  const frameThresh = Number(record.frameThresh);
  const minNoteLen = Number(record.minNoteLen);
  const minFreq = Number(record.minFreq);
  const maxFreq = Number(record.maxFreq);
  if (Number.isFinite(onsetThresh)) normalized.onsetThresh = onsetThresh;
  if (Number.isFinite(frameThresh)) normalized.frameThresh = frameThresh;
  if (Number.isFinite(minNoteLen)) normalized.minNoteLen = Math.round(minNoteLen);
  if (Number.isFinite(minFreq)) normalized.minFreq = minFreq;
  if (Number.isFinite(maxFreq)) normalized.maxFreq = maxFreq;
  return Object.keys(normalized).length > 0 ? normalized : null;
}

function normalizeReviewState(value: unknown): StoredReviewState | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const params = normalizeReviewParams(record.params);
  const noteEventCount = Number(record.noteEventCount);
  const artifactsRaw =
    record.artifacts && typeof record.artifacts === "object" && !Array.isArray(record.artifacts)
      ? (record.artifacts as Record<string, unknown>)
      : null;
  const artifacts = artifactsRaw
    ? {
        prediction: normalizeArtifactReference(artifactsRaw.prediction),
        noteEvents: normalizeArtifactReference(artifactsRaw.noteEvents),
        previewAudio: normalizeArtifactReference(artifactsRaw.previewAudio),
      }
    : null;
  const hasArtifacts = Boolean(
    artifacts && (artifacts.prediction || artifacts.noteEvents || artifacts.previewAudio)
  );
  if (!params && !Number.isFinite(noteEventCount) && !hasArtifacts) {
    return null;
  }
  return {
    ...(params ? { params } : {}),
    ...(Number.isFinite(noteEventCount) ? { noteEventCount: Math.max(0, Math.round(noteEventCount)) } : {}),
    ...(hasArtifacts ? { artifacts } : {}),
  };
}

export function normalizeStoredTabPayload(value: unknown): StoredTabPayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      tabs: [],
      transcriberSegments: [],
      backendJobId: null,
      multipleGuitars: null,
      review: null,
    };
  }
  const record = value as Record<string, unknown>;
  const multipleGuitarsRaw =
    record.multipleGuitars !== undefined && record.multipleGuitars !== null
      ? record.multipleGuitars
      : record.multiple_guitars;
  const multipleGuitars =
    typeof multipleGuitarsRaw === "boolean"
      ? multipleGuitarsRaw
      : typeof multipleGuitarsRaw === "number"
      ? multipleGuitarsRaw !== 0
      : typeof multipleGuitarsRaw === "string"
      ? ["1", "true", "yes", "on"].includes(multipleGuitarsRaw.trim().toLowerCase())
        ? true
        : ["0", "false", "no", "off"].includes(multipleGuitarsRaw.trim().toLowerCase())
        ? false
        : null
      : null;
  return {
    tabs: normalizeTabSegments(record.tabs ?? record.result ?? record.tab_text),
    transcriberSegments: normalizeTranscriberSegments(
      record.transcriberSegments ?? record.noteEventGroups ?? record.segmentGroups ?? record.segments
    ),
    backendJobId: typeof record.backendJobId === "string" && record.backendJobId.trim() ? record.backendJobId : null,
    ...(multipleGuitars !== null ? { multipleGuitars } : {}),
    review: normalizeReviewState(record.review),
  };
}

export function parseStoredTabPayload(resultJson?: string | null): StoredTabPayload {
  if (!resultJson) {
    return {
      tabs: [],
      transcriberSegments: [],
      backendJobId: null,
      multipleGuitars: null,
      review: null,
    };
  }
  try {
    return normalizeStoredTabPayload(JSON.parse(resultJson));
  } catch {
    return {
      tabs: [],
      transcriberSegments: [],
      backendJobId: null,
      multipleGuitars: null,
      review: null,
    };
  }
}

export function serializeStoredTabPayload(payload: StoredTabPayload): string {
  const normalizedReview = normalizeReviewState(payload.review);
  return JSON.stringify({
    tabs: normalizeTabSegments(payload.tabs),
    ...(payload.transcriberSegments.length > 0 ? { transcriberSegments: payload.transcriberSegments } : {}),
    ...(payload.backendJobId ? { backendJobId: payload.backendJobId } : {}),
    ...(typeof payload.multipleGuitars === "boolean" ? { multipleGuitars: payload.multipleGuitars } : {}),
    ...(normalizedReview ? { review: normalizedReview } : {}),
  });
}
