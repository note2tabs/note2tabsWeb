export type StoredTranscriberSegment = {
  lineStart: number;
  lineEnd: number;
  midiNum?: number | null;
  MidiNumLine: number[];
};

export type StoredTranscriberSegmentGroup = StoredTranscriberSegment[];

export type StoredTabPayload = {
  tabs: string[][];
  transcriberSegments: StoredTranscriberSegmentGroup[];
  backendJobId?: string | null;
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

export function normalizeStoredTabPayload(value: unknown): StoredTabPayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      tabs: [],
      transcriberSegments: [],
      backendJobId: null,
    };
  }
  const record = value as Record<string, unknown>;
  return {
    tabs: normalizeTabSegments(record.tabs ?? record.result ?? record.tab_text),
    transcriberSegments: normalizeTranscriberSegments(
      record.transcriberSegments ?? record.segmentGroups ?? record.segments
    ),
    backendJobId: typeof record.backendJobId === "string" && record.backendJobId.trim() ? record.backendJobId : null,
  };
}

export function parseStoredTabPayload(resultJson?: string | null): StoredTabPayload {
  if (!resultJson) {
    return {
      tabs: [],
      transcriberSegments: [],
      backendJobId: null,
    };
  }
  try {
    return normalizeStoredTabPayload(JSON.parse(resultJson));
  } catch {
    return {
      tabs: [],
      transcriberSegments: [],
      backendJobId: null,
    };
  }
}

export function serializeStoredTabPayload(payload: StoredTabPayload): string {
  return JSON.stringify({
    tabs: normalizeTabSegments(payload.tabs),
    ...(payload.transcriberSegments.length > 0 ? { transcriberSegments: payload.transcriberSegments } : {}),
    ...(payload.backendJobId ? { backendJobId: payload.backendJobId } : {}),
  });
}
