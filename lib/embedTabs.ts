import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { buildTabTextFromSnapshot } from "./gteTabText";
import { DRUM_VOICES, getDrumVoiceForNote, isDrumTrackType } from "./gteDrums";
import { buildTabRefForTuning, getTuningPreset, normalizeCapo } from "./gteTuning";
import type { CanvasSnapshot, Chord, EditorSnapshot, Note, NoteEffect, TabCoord } from "../types/gte";
import type { EmbeddedTabPayload, EmbeddedTabTrack } from "../types/embedTabs";

const API_BASE = process.env.BACKEND_API_BASE_URL || "http://127.0.0.1:8000";
const BACKEND_SECRET =
  process.env.BACKEND_SHARED_SECRET || process.env.NOTE2TABS_BACKEND_SECRET;
const EMBED_CACHE_TTL_MS = 15_000;
const EMBED_CACHE_MAX_ENTRIES = 100;
const MAX_TRACKS = 16;
const MAX_EVENTS_PER_TRACK = 40_000;
const MAX_BARS_PER_TRACK = 512;
const TAB_BARS_PER_ROW = 2;
const TAB_BAR_WIDTH = 24;
const DRUM_BAR_WIDTH = 16;
const UNSAFE_TEXT_RE = /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g;

type CachedEmbed = {
  expiresAt: number;
  payload: EmbeddedTabPayload;
};

const embedCache = new Map<string, CachedEmbed>();

export class EmbedEditorLoadError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "EmbedEditorLoadError";
    this.status = status;
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));

const finiteNumber = (value: unknown, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const clampInt = (value: unknown, fallback: number, min: number, max: number) =>
  Math.max(min, Math.min(max, Math.round(finiteNumber(value, fallback))));

const clampFloat = (value: unknown, fallback: number, min: number, max: number) =>
  Math.max(min, Math.min(max, finiteNumber(value, fallback)));

export const sanitizeEmbedLabel = (value: unknown, fallback: string, maxLength = 100) => {
  const normalized =
    typeof value === "string"
      ? value.normalize("NFKC").replace(UNSAFE_TEXT_RE, " ").replace(/\s+/g, " ").trim()
      : "";
  return (normalized || fallback).slice(0, maxLength).trimEnd();
};

export const createEmbedSecret = () => randomBytes(32).toString("base64url");

export const hashEmbedSecret = (secret: string) =>
  createHash("sha256").update(secret, "utf8").digest("hex");

export const verifyEmbedSecret = (secret: string, expectedHash: string) => {
  if (!secret || !/^[a-f0-9]{64}$/i.test(expectedHash)) return false;
  const actual = Buffer.from(hashEmbedSecret(secret), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
};

export const readEmbedBearerSecret = (authorization: string | string[] | undefined) => {
  const value = Array.isArray(authorization) ? authorization[0] : authorization;
  if (!value) return null;
  const match = value.match(/^Bearer\s+([A-Za-z0-9_-]{32,128})$/);
  return match?.[1] || null;
};

const escapeHtmlAttribute = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

export const buildEmbedCredentials = (input: {
  baseUrl: string;
  shareId: string;
  secret: string;
  title?: string;
}) => {
  const baseUrl = input.baseUrl.replace(/\/$/, "");
  const embedUrl = `${baseUrl}/embed/tabs/${encodeURIComponent(input.shareId)}#${input.secret}`;
  const title = sanitizeEmbedLabel(input.title, "Embedded guitar tab", 120);
  const iframeHtml = `<iframe src="${escapeHtmlAttribute(embedUrl)}" title="${escapeHtmlAttribute(
    title
  )}" width="100%" height="480" loading="lazy" referrerpolicy="no-referrer" sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox" style="border:0;border-radius:14px;overflow:hidden"></iframe>`;
  return { embedUrl, iframeHtml };
};

const sanitizeTabCoord = (value: unknown): TabCoord | null => {
  if (!Array.isArray(value) || value.length < 2) return null;
  const stringIndex = clampInt(value[0], -1, -1, 5);
  const fret = clampInt(value[1], -1, -1, 99);
  return stringIndex >= 0 && fret >= 0 ? [stringIndex, fret] : null;
};

const sanitizeTuning = (value: unknown) => {
  const raw = isRecord(value) ? value : {};
  const preset = getTuningPreset(typeof raw.presetId === "string" ? raw.presetId : undefined);
  const provided = Array.isArray(raw.openStringMidi)
    ? raw.openStringMidi
        .slice(0, 6)
        .map((item) => clampInt(item, -1, -1, 127))
        .filter((item) => item >= 0)
    : [];
  const openStringMidi = provided.length === 6 ? provided : [...preset.openStringMidi];
  const capo = normalizeCapo(raw.capo);
  return {
    tuning: {
      presetId: preset.id,
      label: preset.label,
      openStringMidi,
      capo,
    },
    tabRef: buildTabRefForTuning(openStringMidi, capo, 99),
  };
};

const sanitizeLane = (value: unknown, index: number) => {
  const raw = isRecord(value) ? value : {};
  const kind: EmbeddedTabTrack["kind"] = isDrumTrackType(
    raw.trackType ?? raw.editorType ?? raw.type
  )
    ? "drums"
    : String(raw.trackType ?? raw.editorType ?? raw.type).toLowerCase().includes("chord")
      ? "chords"
      : "tab";
  const framesPerBar = clampInt(raw.framesPerMessure, 480, 1, 10_000);
  const requestedTotalFrames = Math.max(
    framesPerBar,
    clampInt(raw.totalFrames, framesPerBar, framesPerBar, 100_000_000)
  );
  const totalFrames = Math.min(requestedTotalFrames, framesPerBar * MAX_BARS_PER_TRACK);
  const rawNotes = Array.isArray(raw.notes) ? raw.notes : [];
  const noteIdMap = new Map<string, number>();
  const notes: Note[] = [];
  let omittedEvents = rawNotes.length > MAX_EVENTS_PER_TRACK || requestedTotalFrames > totalFrames;

  for (const entry of rawNotes.slice(0, MAX_EVENTS_PER_TRACK)) {
    if (!isRecord(entry)) continue;
    const startTime = clampInt(entry.startTime, -1, -1, totalFrames);
    const tab = sanitizeTabCoord(entry.tab);
    if (startTime < 0 || startTime >= totalFrames || !tab) {
      if (startTime >= totalFrames) omittedEvents = true;
      continue;
    }
    const id = notes.length + 1;
    if (entry.id !== undefined) noteIdMap.set(String(entry.id), id);
    notes.push({
      id,
      startTime,
      length: Math.min(
        totalFrames - startTime,
        clampInt(entry.length, 1, 1, totalFrames)
      ),
      midiNum: clampInt(entry.midiNum, 0, 0, 127),
      tab,
      optimals: [],
    });
  }

  const rawChords = Array.isArray(raw.chords) ? raw.chords : [];
  const chords: Chord[] = [];
  if (rawChords.length > MAX_EVENTS_PER_TRACK) omittedEvents = true;
  for (const entry of rawChords.slice(0, MAX_EVENTS_PER_TRACK)) {
    if (!isRecord(entry)) continue;
    const startTime = clampInt(entry.startTime, -1, -1, totalFrames);
    if (startTime < 0 || startTime >= totalFrames) {
      if (startTime >= totalFrames) omittedEvents = true;
      continue;
    }
    const currentTabs = (Array.isArray(entry.currentTabs) ? entry.currentTabs : [])
      .slice(0, 6)
      .map(sanitizeTabCoord)
      .filter((tab): tab is TabCoord => Boolean(tab));
    if (!currentTabs.length) continue;
    const originalMidi = (Array.isArray(entry.originalMidi) ? entry.originalMidi : [])
      .slice(0, currentTabs.length)
      .map((item) => clampInt(item, 0, 0, 127));
    chords.push({
      id: chords.length + 1,
      startTime,
      length: Math.min(
        totalFrames - startTime,
        clampInt(entry.length, 1, 1, totalFrames)
      ),
      originalMidi,
      currentTabs,
      ogTabs: currentTabs.map((tab) => [tab[0], tab[1]]),
    });
  }

  const noteEffects: NoteEffect[] = (Array.isArray(raw.noteEffects) ? raw.noteEffects : [])
    .slice(0, MAX_EVENTS_PER_TRACK)
    .flatMap((entry) => {
      if (!isRecord(entry)) return [];
      const startNoteId = noteIdMap.get(String(entry.startNoteId));
      const endNoteId = noteIdMap.get(String(entry.endNoteId));
      if (!startNoteId || !endNoteId || startNoteId === endNoteId) return [];
      return [
        {
          id: 0,
          type: clampInt(entry.type, 0, 0, 2),
          startNoteId,
          endNoteId,
          noteEffectLabel: sanitizeEmbedLabel(entry.noteEffectLabel, "", 4),
        },
      ];
    })
    .map((effect, effectIndex) => ({ ...effect, id: effectIndex + 1 }));
  const { tuning, tabRef } = sanitizeTuning(raw.tuning);
  const timeSignature = clampInt(raw.timeSignature, 4, 1, 64);
  const timeSignatureBottom = clampInt(raw.timeSignatureBottom, 4, 1, 64);
  const secondsPerBar = clampFloat(raw.secondsPerBar, 2, 0.1, 120);

  const snapshot: EditorSnapshot = {
    id: `track-${index + 1}`,
    name: sanitizeEmbedLabel(raw.name, `Track ${index + 1}`),
    editorType: kind,
    trackType: kind,
    framesPerMessure: framesPerBar,
    fps: clampInt(raw.fps, Math.round(framesPerBar / secondsPerBar), 1, 100_000),
    totalFrames,
    secondsPerBar,
    timeSignature,
    timeSignatureBottom,
    notes,
    chords,
    noteEffects,
    cutPositionsWithCoords: [[[0, totalFrames], [2, 0]]],
    optimalsByTime: {},
    tuning,
    tabRef,
  };

  return { kind, snapshot, truncated: omittedEvents };
};

const buildDrumTabText = (snapshot: EditorSnapshot) => {
  const framesPerBar = Math.max(1, snapshot.framesPerMessure);
  const totalBars = Math.max(1, Math.ceil(snapshot.totalFrames / framesPerBar));
  const bars = Array.from({ length: totalBars }, () =>
    Array.from({ length: DRUM_VOICES.length }, () =>
      Array.from({ length: DRUM_BAR_WIDTH }, () => "-")
    )
  );

  snapshot.notes.forEach((note) => {
    const voice = getDrumVoiceForNote(note);
    const voiceIndex = DRUM_VOICES.findIndex((candidate) => candidate.id === voice.id);
    if (voiceIndex < 0) return;
    const barIndex = Math.max(0, Math.min(totalBars - 1, Math.floor(note.startTime / framesPerBar)));
    const frameInBar = note.startTime - barIndex * framesPerBar;
    const column = Math.max(
      0,
      Math.min(DRUM_BAR_WIDTH - 1, Math.round((frameInBar / framesPerBar) * (DRUM_BAR_WIDTH - 1)))
    );
    bars[barIndex][voiceIndex][column] = "x";
  });

  const rows: string[] = [];
  for (let rowStart = 0; rowStart < totalBars; rowStart += TAB_BARS_PER_ROW) {
    const rowEnd = Math.min(totalBars, rowStart + TAB_BARS_PER_ROW);
    DRUM_VOICES.forEach((voice, voiceIndex) => {
      let line = `${voice.shortLabel}|`;
      for (let barIndex = rowStart; barIndex < rowEnd; barIndex += 1) {
        line += `${bars[barIndex][voiceIndex].join("")}|`;
      }
      rows.push(line);
    });
    if (rowEnd < totalBars) rows.push("");
  }
  return rows.join("\n");
};

export const sanitizeEditorForEmbed = (value: unknown): EmbeddedTabPayload => {
  const raw = isRecord(value) ? value : {};
  const hasSingleLaneShape =
    Array.isArray(raw.notes) ||
    Array.isArray(raw.chords) ||
    Number.isFinite(Number(raw.framesPerMessure));
  const rawLanes = Array.isArray(raw.editors)
    ? raw.editors.filter(isRecord)
    : hasSingleLaneShape
      ? [raw]
      : [];
  const lanes = rawLanes.slice(0, MAX_TRACKS).map(sanitizeLane);
  const firstLane = lanes[0]?.snapshot;
  const beats = firstLane?.timeSignature || 4;
  const beatUnit = firstLane?.timeSignatureBottom || 4;
  const secondsPerBar = clampFloat(raw.secondsPerBar, firstLane?.secondsPerBar || 2, 0.1, 120);
  const bpmValue = secondsPerBar > 0 ? (60 / secondsPerBar) * beats : NaN;
  const bpm = Number.isFinite(bpmValue) ? Math.round(bpmValue * 100) / 100 : null;
  const tracks = lanes.map(({ kind, snapshot, truncated }, index): EmbeddedTabTrack => ({
    id: `track-${index + 1}`,
    name: snapshot.name || `Track ${index + 1}`,
    kind,
    tabText:
      kind === "drums"
        ? buildDrumTabText(snapshot)
        : buildTabTextFromSnapshot(snapshot, {
            barsPerRow: TAB_BARS_PER_ROW,
            barWidth: TAB_BAR_WIDTH,
          }),
    truncated,
  }));

  return {
    schemaVersion: 1,
    title: sanitizeEmbedLabel(raw.name, "Untitled tab", 120),
    bpm,
    timeSignature: `${beats}/${beatUnit}`,
    tracks,
  };
};

const pruneEmbedCache = () => {
  const now = Date.now();
  for (const [key, entry] of embedCache) {
    if (entry.expiresAt <= now) embedCache.delete(key);
  }
  while (embedCache.size >= EMBED_CACHE_MAX_ENTRIES) {
    const oldestKey = embedCache.keys().next().value;
    if (!oldestKey) break;
    embedCache.delete(oldestKey);
  }
};

export const loadSanitizedEditorForEmbed = async (input: {
  ownerId: string;
  editorId: string;
  fetcher?: typeof fetch;
}) => {
  const cacheKey = hashEmbedSecret(`${input.ownerId}:${input.editorId}`);
  const cached = embedCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.payload;
  if (cached) embedCache.delete(cacheKey);

  const headers: Record<string, string> = { "X-User-Id": input.ownerId };
  if (BACKEND_SECRET) headers["X-Backend-Secret"] = BACKEND_SECRET;
  if (process.env.NODE_ENV === "production" && !BACKEND_SECRET) {
    throw new EmbedEditorLoadError("Editor service is not configured.", 503);
  }

  let response: Response;
  try {
    response = await (input.fetcher || fetch)(
      `${API_BASE}/gte/editors/${encodeURIComponent(input.editorId)}`,
      { method: "GET", headers, cache: "no-store" }
    );
  } catch {
    throw new EmbedEditorLoadError("Editor service is unavailable.", 502);
  }
  if (response.status === 404) throw new EmbedEditorLoadError("Editor not found.", 404);
  if (!response.ok) throw new EmbedEditorLoadError("Could not load editor.", 502);

  const payload = sanitizeEditorForEmbed((await response.json()) as CanvasSnapshot | EditorSnapshot);
  if (!payload.tracks.length) throw new EmbedEditorLoadError("Editor has no tracks.", 422);
  pruneEmbedCache();
  embedCache.set(cacheKey, { payload, expiresAt: Date.now() + EMBED_CACHE_TTL_MS });
  return payload;
};

export const clearEmbedCacheForTests = () => embedCache.clear();
