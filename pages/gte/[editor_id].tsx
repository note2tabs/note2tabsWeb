import { GetServerSideProps } from "next";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type UIEvent as ReactUiEvent,
} from "react";
import { getServerSession } from "next-auth/next";
import { useSession } from "next-auth/react";
import { authOptions } from "../api/auth/[...nextauth]";
import { useRouter } from "next/router";
import { buildLaneEditorRef, gteApi } from "../../lib/gteApi";
import type { CanvasSnapshot, EditorSnapshot } from "../../types/gte";
import GteWorkspace from "../../components/GteWorkspace";
import {
  GTE_GUEST_EDITOR_ID,
  createGuestSnapshot,
  readGuestDraft,
  writeGuestDraft,
} from "../../lib/gteGuestDraft";

type Props = {
  editorId: string;
  isGuestMode: boolean;
};

const FIXED_FRAMES_PER_BAR = 480;
const DEFAULT_SECONDS_PER_BAR = 2;
const CANVAS_AUTOSAVE_MS = 20000;
const MAX_CANVAS_HISTORY = 64;
const STANDARD_TUNING_MIDI = [64, 59, 55, 50, 45, 40];

const toNumber = (value: unknown, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const fpsFromSecondsPerBar = (secondsPerBar: number) =>
  Math.max(1, Math.round(FIXED_FRAMES_PER_BAR / Math.max(0.1, secondsPerBar)));

const isCanvasSnapshot = (value: unknown): value is CanvasSnapshot =>
  Boolean(value && typeof value === "object" && Array.isArray((value as CanvasSnapshot).editors));

const normalizeLane = (
  lane: EditorSnapshot,
  laneId: string,
  secondsPerBar: number,
  index: number
): EditorSnapshot => {
  const safeSeconds = Math.max(0.1, toNumber(lane.secondsPerBar, secondsPerBar));
  return {
    ...lane,
    id: laneId,
    name: lane.name || `Editor ${index + 1}`,
    framesPerMessure: FIXED_FRAMES_PER_BAR,
    secondsPerBar: safeSeconds,
    fps: fpsFromSecondsPerBar(safeSeconds),
    totalFrames: Math.max(FIXED_FRAMES_PER_BAR, Math.round(toNumber(lane.totalFrames, FIXED_FRAMES_PER_BAR))),
    timeSignature: Math.max(1, Math.min(64, Math.round(toNumber(lane.timeSignature, 8)))),
    notes: Array.isArray(lane.notes) ? lane.notes : [],
    chords: Array.isArray(lane.chords) ? lane.chords : [],
    cutPositionsWithCoords: Array.isArray(lane.cutPositionsWithCoords) ? lane.cutPositionsWithCoords : [],
    optimalsByTime:
      lane.optimalsByTime && typeof lane.optimalsByTime === "object" ? lane.optimalsByTime : {},
    tabRef: Array.isArray(lane.tabRef) ? lane.tabRef : createGuestSnapshot(laneId).tabRef,
  };
};

const normalizeCanvas = (raw: unknown, fallbackCanvasId: string): CanvasSnapshot => {
  if (isCanvasSnapshot(raw)) {
    const safeSeconds = Math.max(
      0.1,
      toNumber(raw.secondsPerBar, toNumber(raw.editors?.[0]?.secondsPerBar, DEFAULT_SECONDS_PER_BAR))
    );
    const normalizedEditors = (raw.editors || []).map((lane, index) =>
      normalizeLane(lane, lane.id || `ed-${index + 1}`, safeSeconds, index)
    );
    return {
      id: raw.id || fallbackCanvasId,
      name: raw.name || "Untitled",
      schemaVersion: raw.schemaVersion,
      canvasSchemaVersion: raw.canvasSchemaVersion,
      version: raw.version,
      updatedAt: raw.updatedAt,
      secondsPerBar: safeSeconds,
      editors: normalizedEditors.length
        ? normalizedEditors
        : [normalizeLane(createGuestSnapshot("ed-1"), "ed-1", safeSeconds, 0)],
    };
  }

  const lane = normalizeLane(
    (raw as EditorSnapshot) || createGuestSnapshot("ed-1"),
    "ed-1",
    toNumber((raw as EditorSnapshot)?.secondsPerBar, DEFAULT_SECONDS_PER_BAR),
    0
  );
  return {
    id: fallbackCanvasId,
    name: lane.name || "Untitled",
    schemaVersion: 1,
    canvasSchemaVersion: 1,
    version: lane.version || 1,
    updatedAt: lane.updatedAt,
    secondsPerBar: lane.secondsPerBar || DEFAULT_SECONDS_PER_BAR,
    editors: [lane],
  };
};

const buildLocalLane = (index: number, secondsPerBar: number): EditorSnapshot => {
  const laneId = `ed-${index + 1}`;
  return normalizeLane(createGuestSnapshot(laneId), laneId, secondsPerBar, index);
};

export default function GteEditorPage({ editorId, isGuestMode }: Props) {
  const { data: session } = useSession();
  const [canvas, setCanvas] = useState<CanvasSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState("");
  const [nameSaving, setNameSaving] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [secondsDraft, setSecondsDraft] = useState(String(DEFAULT_SECONDS_PER_BAR));
  const [secondsSaving, setSecondsSaving] = useState(false);
  const [secondsError, setSecondsError] = useState<string | null>(null);
  const [activeLaneId, setActiveLaneId] = useState<string | null>(null);
  const [savingCanvas, setSavingCanvas] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [hasPendingCommit, setHasPendingCommit] = useState(false);
  const [lastCommittedAt, setLastCommittedAt] = useState<string | null>(null);
  const [addingLane, setAddingLane] = useState(false);
  const [deletingLaneId, setDeletingLaneId] = useState<string | null>(null);
  const [confirmDeleteTrackId, setConfirmDeleteTrackId] = useState<string | null>(null);
  const [globalSnapToGridEnabled, setGlobalSnapToGridEnabled] = useState(true);
  const [sharedTimelineScrollRatio, setSharedTimelineScrollRatio] = useState(0);
  const [globalPlaybackFrame, setGlobalPlaybackFrame] = useState(0);
  const [globalPlaybackIsPlaying, setGlobalPlaybackIsPlaying] = useState(false);
  const [globalPlaybackVolume, setGlobalPlaybackVolume] = useState(0.6);
  const [trackMuteById, setTrackMuteById] = useState<Record<string, boolean>>({});
  const [laneSelectionById, setLaneSelectionById] = useState<
    Record<string, { noteCount: number; chordCount: number; noteIds: number[]; chordIds: number[] }>
  >({});
  const [selectionClearEpoch, setSelectionClearEpoch] = useState(0);
  const [selectionClearExemptEditorId, setSelectionClearExemptEditorId] = useState<string | null>(
    null
  );
  const globalPlaybackFrameRef = useRef(0);
  const [canvasUndoCount, setCanvasUndoCount] = useState(0);
  const [canvasRedoCount, setCanvasRedoCount] = useState(0);
  const telemetrySessionRef = useRef<string | null>(null);
  const telemetryStartedAtRef = useRef<number | null>(null);
  const telemetryClosedRef = useRef(false);
  const globalTimelineScrollbarRef = useRef<HTMLDivElement | null>(null);
  const applyingGlobalTimelineScrollbarRef = useRef(false);
  const globalPlaybackAudioRef = useRef<AudioContext | null>(null);
  const globalPlaybackMasterGainRef = useRef<GainNode | null>(null);
  const globalPlaybackRafRef = useRef<number | null>(null);
  const globalPlaybackStartTimeRef = useRef<number | null>(null);
  const globalPlaybackStartFrameRef = useRef(0);
  const globalPlaybackEndFrameRef = useRef<number | null>(null);
  const globalPlaybackAudioStartRef = useRef<number | null>(null);
  const canvasUndoRef = useRef<CanvasSnapshot[]>([]);
  const canvasRedoRef = useRef<CanvasSnapshot[]>([]);
  const router = useRouter();
  const saveToAccountPath = "/gte?importGuest=1";
  const loginSaveHref = `/auth/login?next=${encodeURIComponent(saveToAccountPath)}`;
  const signupSaveHref = `/auth/signup?next=${encodeURIComponent(saveToAccountPath)}`;

  const cloneCanvas = useCallback((value: CanvasSnapshot) => {
    return JSON.parse(JSON.stringify(value)) as CanvasSnapshot;
  }, []);

  const canvasSnapshotsEqual = useCallback((left: CanvasSnapshot, right: CanvasSnapshot) => {
    return JSON.stringify(left) === JSON.stringify(right);
  }, []);

  const resetCanvasHistory = useCallback(() => {
    canvasUndoRef.current = [];
    canvasRedoRef.current = [];
    setCanvasUndoCount(0);
    setCanvasRedoCount(0);
  }, []);

  const recordCanvasHistory = useCallback(
    (previous: CanvasSnapshot, next: CanvasSnapshot) => {
      if (canvasSnapshotsEqual(previous, next)) return;
      const nextUndo = [...canvasUndoRef.current, cloneCanvas(previous)];
      if (nextUndo.length > MAX_CANVAS_HISTORY) {
        nextUndo.splice(0, nextUndo.length - MAX_CANVAS_HISTORY);
      }
      canvasUndoRef.current = nextUndo;
      canvasRedoRef.current = [];
      setCanvasUndoCount(nextUndo.length);
      setCanvasRedoCount(0);
    },
    [canvasSnapshotsEqual, cloneCanvas]
  );

  const loadEditor = async () => {
    if (isGuestMode) return;
    setLoading(true);
    setError(null);
    try {
      const data = await gteApi.getEditor(editorId);
      const normalized = normalizeCanvas(data, editorId);
      setCanvas(normalized);
      resetCanvasHistory();
      setActiveLaneId((prev) =>
        prev && normalized.editors.some((lane) => lane.id === prev) ? prev : normalized.editors[0]?.id || null
      );
      setLastCommittedAt(normalized.updatedAt || null);
      setHasPendingCommit(false);
    } catch (err: any) {
      setError(err?.message || "Could not load editor.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!editorId) return;
    setSharedTimelineScrollRatio(0);
    if (isGuestMode) {
      setLoading(true);
      setError(null);
      const localSnapshot = readGuestDraft() ?? createGuestSnapshot(editorId);
      const normalized = normalizeCanvas(localSnapshot, editorId);
      setCanvas(normalized);
      resetCanvasHistory();
      setActiveLaneId((prev) =>
        prev && normalized.editors.some((lane) => lane.id === prev) ? prev : normalized.editors[0]?.id || null
      );
      setLastCommittedAt(normalized.updatedAt || null);
      setHasPendingCommit(false);
      setLoading(false);
      return;
    }
    void loadEditor();
  }, [editorId, isGuestMode, resetCanvasHistory]);

  useEffect(() => {
    if (!editorId || isGuestMode) return;

    const createSessionId = () => {
      if (typeof globalThis.crypto !== "undefined" && typeof globalThis.crypto.randomUUID === "function") {
        return globalThis.crypto.randomUUID();
      }
      return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    };

    const sessionId = createSessionId();
    telemetrySessionRef.current = sessionId;
    telemetryStartedAtRef.current = Date.now();
    telemetryClosedRef.current = false;

    const sendTelemetry = (
      event: "gte_editor_visit" | "gte_editor_session_start" | "gte_editor_session_end",
      durationSec?: number
    ) => {
      const payload = {
        event,
        editorId,
        sessionId,
        path: window.location.pathname,
        ...(durationSec !== undefined ? { durationSec } : {}),
      };
      return fetch("/api/gte/telemetry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        keepalive: true,
      });
    };

    void sendTelemetry("gte_editor_visit").catch(() => {});
    void sendTelemetry("gte_editor_session_start").catch(() => {});

    const flushSessionEnd = () => {
      if (telemetryClosedRef.current) return;
      telemetryClosedRef.current = true;
      const startedAt = telemetryStartedAtRef.current ?? Date.now();
      const durationSec = Math.max(0, Math.round((Date.now() - startedAt) / 1000));
      const payload = JSON.stringify({
        event: "gte_editor_session_end",
        editorId,
        sessionId,
        durationSec,
        path: window.location.pathname,
      });

      if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
        const blob = new Blob([payload], { type: "application/json" });
        navigator.sendBeacon("/api/gte/telemetry", blob);
        return;
      }

      void fetch("/api/gte/telemetry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
        keepalive: true,
      }).catch(() => {});
    };

    const handlePageHide = () => flushSessionEnd();
    window.addEventListener("pagehide", handlePageHide);
    window.addEventListener("beforeunload", handlePageHide);

    return () => {
      flushSessionEnd();
      window.removeEventListener("pagehide", handlePageHide);
      window.removeEventListener("beforeunload", handlePageHide);
    };
  }, [editorId, isGuestMode]);

  useEffect(() => {
    if (!canvas) return;
    setNameDraft(canvas.name || "Untitled");
    setSecondsDraft(String(Math.max(0.1, toNumber(canvas.secondsPerBar, DEFAULT_SECONDS_PER_BAR))));
    if (activeLaneId && !canvas.editors.some((lane) => lane.id === activeLaneId)) {
      setActiveLaneId(canvas.editors[0]?.id || null);
    }
  }, [canvas?.name, canvas?.secondsPerBar, canvas?.editors, activeLaneId]);

  const handleMainMouseDownCapture = useCallback((event: ReactMouseEvent<HTMLElement>) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest("[data-gte-track='true']")) return;
    setActiveLaneId(null);
  }, []);

  useEffect(() => {
    if (!isGuestMode || !canvas) return;
    const firstLane = canvas.editors[0];
    if (!firstLane) return;
    writeGuestDraft({
      ...firstLane,
      id: GTE_GUEST_EDITOR_ID,
      name: canvas.name || firstLane.name || "Untitled",
      updatedAt: new Date().toISOString(),
      secondsPerBar: canvas.secondsPerBar || firstLane.secondsPerBar || DEFAULT_SECONDS_PER_BAR,
    });
  }, [isGuestMode, canvas]);

  const commitCanvasToBackend = useCallback(
    async (options?: { force?: boolean; keepalive?: boolean }) => {
      if (!canvas) return;
      if (isGuestMode) {
        setHasPendingCommit(false);
        setLastCommittedAt(new Date().toISOString());
        return;
      }
      if (!options?.force && !hasPendingCommit) return;
      setSavingCanvas(true);
      setSaveError(null);
      try {
        const res = await gteApi.commitEditor(editorId, { keepalive: options?.keepalive });
        const normalized = normalizeCanvas(res.snapshot, editorId);
        setCanvas(normalized);
        setLastCommittedAt(normalized.updatedAt || new Date().toISOString());
        setHasPendingCommit(false);
      } catch (err: any) {
        setSaveError(err?.message || "Could not save editor.");
      } finally {
        setSavingCanvas(false);
      }
    },
    [canvas, editorId, hasPendingCommit, isGuestMode]
  );

  const syncCanvasDraftToBackend = useCallback(
    async (nextCanvas: CanvasSnapshot, options?: { silent?: boolean }) => {
      if (isGuestMode) return;
      try {
        await gteApi.applySnapshot(editorId, cloneCanvas(nextCanvas));
      } catch (err: any) {
        if (!options?.silent) {
          setSaveError(err?.message || "Could not sync canvas draft.");
        }
      }
    },
    [cloneCanvas, editorId, isGuestMode]
  );

  useEffect(() => {
    if (isGuestMode || !hasPendingCommit) return;
    const timer = setInterval(() => {
      void commitCanvasToBackend();
    }, CANVAS_AUTOSAVE_MS);
    return () => clearInterval(timer);
  }, [isGuestMode, hasPendingCommit, commitCanvasToBackend]);

  useEffect(() => {
    if (isGuestMode) return;
    const flush = () => {
      if (!hasPendingCommit) return;
      void commitCanvasToBackend({ force: true, keepalive: true });
    };
    const handleVisibility = () => {
      if (document.visibilityState === "hidden") {
        flush();
      }
    };
    window.addEventListener("beforeunload", flush);
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.removeEventListener("beforeunload", flush);
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [isGuestMode, hasPendingCommit, commitCanvasToBackend]);

  const applyCanvasUpdate = useCallback(
    (next: CanvasSnapshot, options?: { markDirty?: boolean; recordHistory?: boolean }) => {
      setCanvas((prev) => {
        if (prev && options?.recordHistory !== false) {
          recordCanvasHistory(prev, next);
        }
        return next;
      });
      if (options?.markDirty !== false) {
        setHasPendingCommit(true);
      }
    },
    [recordCanvasHistory]
  );

  const commitName = async () => {
    if (!canvas) return;
    const trimmed = nameDraft.trim();
    const normalizedName = trimmed || "Untitled";
    if (normalizedName === (canvas.name || "Untitled")) return;
    if (isGuestMode) {
      applyCanvasUpdate(
        {
          ...canvas,
          name: normalizedName,
          updatedAt: new Date().toISOString(),
        },
        { markDirty: true }
      );
      return;
    }
    setNameSaving(true);
    setNameError(null);
    try {
      const res = await gteApi.setEditorName(editorId, normalizedName);
      const nextCanvas = normalizeCanvas(
        (res as any).canvas ? (res as any).canvas : (res as any).snapshot,
        editorId
      );
      applyCanvasUpdate(nextCanvas, { markDirty: true });
    } catch (err: any) {
      setNameError(err?.message || "Could not update name.");
    } finally {
      setNameSaving(false);
    }
  };

  const commitSecondsPerBar = async () => {
    if (!canvas) return;
    const next = Number(secondsDraft);
    if (!Number.isFinite(next) || next <= 0) {
      setSecondsError("Seconds/bar must be greater than 0.");
      setSecondsDraft(String(canvas.secondsPerBar || DEFAULT_SECONDS_PER_BAR));
      return;
    }
    const normalized = Math.max(0.1, next);
    if (Math.abs(normalized - (canvas.secondsPerBar || DEFAULT_SECONDS_PER_BAR)) < 0.0001) return;
    if (isGuestMode) {
      applyCanvasUpdate(
        {
          ...canvas,
          secondsPerBar: normalized,
          updatedAt: new Date().toISOString(),
          editors: canvas.editors.map((lane, index) =>
            normalizeLane(lane, lane.id || `ed-${index + 1}`, normalized, index)
          ),
        },
        { markDirty: true }
      );
      return;
    }
    setSecondsSaving(true);
    setSecondsError(null);
    try {
      const res = await gteApi.setSecondsPerBar(editorId, normalized);
      const nextCanvas = normalizeCanvas((res as any).canvas ?? canvas, editorId);
      applyCanvasUpdate(nextCanvas, { markDirty: true });
    } catch (err: any) {
      setSecondsError(err?.message || "Could not update seconds per bar.");
    } finally {
      setSecondsSaving(false);
    }
  };

  const handleAddLane = async () => {
    if (!canvas || addingLane) return;
    if (isGuestMode) {
      const existing = new Set(canvas.editors.map((lane) => lane.id));
      let laneIndex = canvas.editors.length + 1;
      while (existing.has(`ed-${laneIndex}`)) {
        laneIndex += 1;
      }
      const lane = buildLocalLane(laneIndex - 1, canvas.secondsPerBar || DEFAULT_SECONDS_PER_BAR);
      const nextCanvas = {
        ...canvas,
        updatedAt: new Date().toISOString(),
        editors: [...canvas.editors, lane],
      };
      applyCanvasUpdate(nextCanvas, { markDirty: true });
      setActiveLaneId(lane.id);
      return;
    }
    setAddingLane(true);
    setError(null);
    try {
      const res = await gteApi.addCanvasEditor(editorId);
      const nextCanvas = normalizeCanvas(res.canvas, editorId);
      applyCanvasUpdate(nextCanvas, { markDirty: true });
      setActiveLaneId(res.editor?.id || nextCanvas.editors[nextCanvas.editors.length - 1]?.id || null);
    } catch (err: any) {
      setError(err?.message || "Could not add track.");
    } finally {
      setAddingLane(false);
    }
  };

  const requestDeleteTrack = useCallback(
    (laneId: string) => {
      if (!canvas || deletingLaneId) return;
      if (canvas.editors.length <= 1) {
        setError("Cannot remove the final track.");
        return;
      }
      setConfirmDeleteTrackId(laneId);
    },
    [canvas, deletingLaneId]
  );

  const handleDeleteLane = async (laneId: string) => {
    if (!canvas || deletingLaneId) return;
    if (canvas.editors.length <= 1) {
      setError("Cannot remove the final track.");
      return;
    }
    setConfirmDeleteTrackId(null);

    if (isGuestMode) {
      const nextEditors = canvas.editors.filter((lane) => lane.id !== laneId);
      const nextCanvas = { ...canvas, editors: nextEditors, updatedAt: new Date().toISOString() };
      applyCanvasUpdate(nextCanvas, { markDirty: true });
      if (activeLaneId === laneId) {
        setActiveLaneId(nextEditors[0]?.id || null);
      }
      return;
    }

    setDeletingLaneId(laneId);
    setError(null);
    try {
      const res = await gteApi.deleteCanvasEditor(editorId, laneId);
      const nextCanvas = normalizeCanvas(res.canvas, editorId);
      applyCanvasUpdate(nextCanvas, { markDirty: true });
      if (activeLaneId === laneId) {
        setActiveLaneId(nextCanvas.editors[0]?.id || null);
      }
    } catch (err: any) {
      setError(err?.message || "Could not remove track.");
    } finally {
      setDeletingLaneId(null);
    }
  };

  const handleLaneSnapshotChange = (
    laneId: string,
    nextLaneSnapshot: EditorSnapshot,
    options?: { recordHistory?: boolean }
  ) => {
    setCanvas((prev) => {
      if (!prev) return prev;
      const secondsPerBar = Math.max(
        0.1,
        toNumber(prev.secondsPerBar, toNumber(nextLaneSnapshot.secondsPerBar, DEFAULT_SECONDS_PER_BAR))
      );
      const nextEditors = prev.editors.map((lane, index) =>
        lane.id === laneId
          ? normalizeLane(nextLaneSnapshot, laneId, secondsPerBar, index)
          : normalizeLane(lane, lane.id || `ed-${index + 1}`, secondsPerBar, index)
      );
      const nextCanvas = {
        ...prev,
        updatedAt: new Date().toISOString(),
        secondsPerBar,
        editors: nextEditors,
      };
      if (options?.recordHistory !== false) {
        recordCanvasHistory(prev, nextCanvas);
      }
      return nextCanvas;
    });
    if (options?.recordHistory !== false) {
      setHasPendingCommit(true);
    }
  };

  const handleCanvasUndo = useCallback(() => {
    if (!canvas) return;
    if (deletingLaneId || addingLane || savingCanvas) return;
    const undoList = canvasUndoRef.current;
    if (!undoList.length) return;
    let nextCanvasSnapshot: CanvasSnapshot | null = null;
    setCanvas((current) => {
      if (!current) return current;
      const previous = undoList[undoList.length - 1];
      const nextUndo = undoList.slice(0, -1);
      const nextRedo = [...canvasRedoRef.current, cloneCanvas(current)];
      if (nextRedo.length > MAX_CANVAS_HISTORY) {
        nextRedo.splice(0, nextRedo.length - MAX_CANVAS_HISTORY);
      }
      canvasUndoRef.current = nextUndo;
      canvasRedoRef.current = nextRedo;
      setCanvasUndoCount(nextUndo.length);
      setCanvasRedoCount(nextRedo.length);
      nextCanvasSnapshot = cloneCanvas(previous);
      return nextCanvasSnapshot;
    });
    setHasPendingCommit(true);
    if (nextCanvasSnapshot) {
      void syncCanvasDraftToBackend(nextCanvasSnapshot, { silent: true });
    }
  }, [addingLane, canvas, cloneCanvas, deletingLaneId, savingCanvas, syncCanvasDraftToBackend]);

  const handleCanvasRedo = useCallback(() => {
    if (!canvas) return;
    if (deletingLaneId || addingLane || savingCanvas) return;
    const redoList = canvasRedoRef.current;
    if (!redoList.length) return;
    let nextCanvasSnapshot: CanvasSnapshot | null = null;
    setCanvas((current) => {
      if (!current) return current;
      const next = redoList[redoList.length - 1];
      const nextRedo = redoList.slice(0, -1);
      const nextUndo = [...canvasUndoRef.current, cloneCanvas(current)];
      if (nextUndo.length > MAX_CANVAS_HISTORY) {
        nextUndo.splice(0, nextUndo.length - MAX_CANVAS_HISTORY);
      }
      canvasUndoRef.current = nextUndo;
      canvasRedoRef.current = nextRedo;
      setCanvasUndoCount(nextUndo.length);
      setCanvasRedoCount(nextRedo.length);
      nextCanvasSnapshot = cloneCanvas(next);
      return nextCanvasSnapshot;
    });
    setHasPendingCommit(true);
    if (nextCanvasSnapshot) {
      void syncCanvasDraftToBackend(nextCanvasSnapshot, { silent: true });
    }
  }, [addingLane, canvas, cloneCanvas, deletingLaneId, savingCanvas, syncCanvasDraftToBackend]);

  useEffect(() => {
    if (activeLaneId !== null) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTyping =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable ||
          target.closest("select"));
      if (isTyping) return;
      if ((event.ctrlKey || event.metaKey) && (event.key === "z" || event.key === "Z")) {
        event.preventDefault();
        if (event.shiftKey) {
          handleCanvasRedo();
        } else {
          handleCanvasUndo();
        }
        return;
      }
      if ((event.ctrlKey || event.metaKey) && (event.key === "y" || event.key === "Y")) {
        event.preventDefault();
        handleCanvasRedo();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeLaneId, handleCanvasRedo, handleCanvasUndo]);

  const saveStatus = useMemo(() => {
    if (isGuestMode) return "Local draft only";
    if (savingCanvas) return "Saving...";
    if (hasPendingCommit) return "Unsaved canvas changes";
    if (lastCommittedAt) {
      return `Saved ${new Date(lastCommittedAt).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })}`;
    }
    return "Saved";
  }, [hasPendingCommit, isGuestMode, lastCommittedAt, savingCanvas]);

  const sharedViewportBarCount = useMemo(() => {
    if (!canvas) return 1;
    let maxBars = 1;
    for (const lane of canvas.editors) {
      const totalFrames = Math.max(1, Math.round(toNumber(lane.totalFrames, FIXED_FRAMES_PER_BAR)));
      const bars = Math.max(1, Math.ceil(totalFrames / FIXED_FRAMES_PER_BAR));
      if (bars > maxBars) maxBars = bars;
    }
    return maxBars;
  }, [canvas]);

  const handleSharedTimelineScrollRatioChange = useCallback((next: number) => {
    const clamped = Math.max(0, Math.min(1, next));
    setSharedTimelineScrollRatio((prev) => (Math.abs(prev - clamped) < 0.001 ? prev : clamped));
  }, []);

  const globalTimelineTrackWidth = useMemo(
    () => Math.max(4000, sharedViewportBarCount * FIXED_FRAMES_PER_BAR * 3),
    [sharedViewportBarCount]
  );

  useEffect(() => {
    const scrollbar = globalTimelineScrollbarRef.current;
    if (!scrollbar) return;
    const ratio = Math.max(0, Math.min(1, sharedTimelineScrollRatio));
    const maxScroll = Math.max(0, scrollbar.scrollWidth - scrollbar.clientWidth);
    const targetScroll = Math.round(maxScroll * ratio);
    if (Math.abs(scrollbar.scrollLeft - targetScroll) < 1) return;
    applyingGlobalTimelineScrollbarRef.current = true;
    scrollbar.scrollLeft = targetScroll;
    window.requestAnimationFrame(() => {
      applyingGlobalTimelineScrollbarRef.current = false;
    });
  }, [sharedTimelineScrollRatio, globalTimelineTrackWidth]);

  const handleGlobalTimelineScrollbarScroll = useCallback(
    (event: ReactUiEvent<HTMLDivElement>) => {
      if (applyingGlobalTimelineScrollbarRef.current) return;
      const maxScroll = Math.max(
        0,
        event.currentTarget.scrollWidth - event.currentTarget.clientWidth
      );
      if (maxScroll <= 0) return;
      handleSharedTimelineScrollRatioChange(event.currentTarget.scrollLeft / maxScroll);
    },
    [handleSharedTimelineScrollRatioChange]
  );

  const canvasTimelineEnd = useMemo(() => {
    if (!canvas) return FIXED_FRAMES_PER_BAR;
    let maxFrames = FIXED_FRAMES_PER_BAR;
    canvas.editors.forEach((lane) => {
      maxFrames = Math.max(maxFrames, Math.max(1, Math.round(toNumber(lane.totalFrames, FIXED_FRAMES_PER_BAR))));
    });
    return maxFrames;
  }, [canvas]);

  const globalPlaybackFps = useMemo(
    () => fpsFromSecondsPerBar(Math.max(0.1, toNumber(canvas?.secondsPerBar, DEFAULT_SECONDS_PER_BAR))),
    [canvas?.secondsPerBar]
  );

  useEffect(() => {
    setGlobalPlaybackFrame((prev) => Math.max(0, Math.min(canvasTimelineEnd, Math.round(prev))));
  }, [canvasTimelineEnd]);

  useEffect(() => {
    globalPlaybackFrameRef.current = globalPlaybackFrame;
  }, [globalPlaybackFrame]);

  useEffect(() => {
    if (!canvas) return;
    setTrackMuteById((prev) => {
      const next: Record<string, boolean> = {};
      canvas.editors.forEach((lane, index) => {
        const laneId = lane.id || `ed-${index + 1}`;
        next[laneId] = Boolean(prev[laneId]);
      });
      const prevKeys = Object.keys(prev);
      const nextKeys = Object.keys(next);
      if (prevKeys.length !== nextKeys.length) {
        return next;
      }
      for (const key of nextKeys) {
        if (prev[key] !== next[key]) {
          return next;
        }
      }
      return prev;
    });
  }, [canvas]);

  useEffect(() => {
    if (!canvas) {
      setLaneSelectionById({});
      return;
    }
    setLaneSelectionById((prev) => {
      const next: Record<string, { noteCount: number; chordCount: number; noteIds: number[]; chordIds: number[] }> = {};
      canvas.editors.forEach((lane, index) => {
        const laneId = lane.id || `ed-${index + 1}`;
        const existing = prev[laneId];
        next[laneId] = existing
          ? existing
          : { noteCount: 0, chordCount: 0, noteIds: [], chordIds: [] };
      });
      const prevKeys = Object.keys(prev);
      const nextKeys = Object.keys(next);
      if (prevKeys.length !== nextKeys.length) return next;
      for (const key of nextKeys) {
        const left = prev[key];
        const right = next[key];
        if (
          !left ||
          left.noteCount !== right.noteCount ||
          left.chordCount !== right.chordCount ||
          left.noteIds.length !== right.noteIds.length ||
          left.chordIds.length !== right.chordIds.length
        ) {
          return next;
        }
      }
      return prev;
    });
  }, [canvas]);

  const handleLaneSelectionStateChange = useCallback(
    (
      laneId: string,
      selection: { noteCount: number; chordCount: number; noteIds: number[]; chordIds: number[] }
    ) => {
      setLaneSelectionById((prev) => {
        const current = prev[laneId] || { noteCount: 0, chordCount: 0, noteIds: [], chordIds: [] };
        const sameNoteIds =
          current.noteIds.length === selection.noteIds.length &&
          current.noteIds.every((id, idx) => id === selection.noteIds[idx]);
        const sameChordIds =
          current.chordIds.length === selection.chordIds.length &&
          current.chordIds.every((id, idx) => id === selection.chordIds[idx]);
        if (
          current.noteCount === selection.noteCount &&
          current.chordCount === selection.chordCount &&
          sameNoteIds &&
          sameChordIds
        ) {
          return prev;
        }
        return {
          ...prev,
          [laneId]: {
            noteCount: selection.noteCount,
            chordCount: selection.chordCount,
            noteIds: [...selection.noteIds],
            chordIds: [...selection.chordIds],
          },
        };
      });
    },
    []
  );

  const multiTrackSelectionActive = useMemo(() => {
    let selectedTrackCount = 0;
    Object.values(laneSelectionById).forEach((selection) => {
      if (selection.noteCount + selection.chordCount > 0) {
        selectedTrackCount += 1;
      }
    });
    return selectedTrackCount > 1;
  }, [laneSelectionById]);

  const handleGlobalSelectedShift = useCallback(
    (_originLaneId: string, deltaFrames: number) => {
      if (!canvas) return false;
      const delta = Math.round(deltaFrames);
      if (delta === 0) return false;

      let selectedTrackCount = 0;
      Object.values(laneSelectionById).forEach((selection) => {
        if (selection.noteCount + selection.chordCount > 0) {
          selectedTrackCount += 1;
        }
      });
      if (selectedTrackCount <= 1) return false;

      let didChange = false;
      setCanvas((prev) => {
        if (!prev) return prev;
        const nextEditors = prev.editors.map((lane, index) => {
          const laneId = lane.id || `ed-${index + 1}`;
          const selection = laneSelectionById[laneId];
          if (!selection || selection.noteCount + selection.chordCount === 0) {
            return lane;
          }
          const noteIdSet = new Set(selection.noteIds);
          const chordIdSet = new Set(selection.chordIds);
          const laneFrames = Math.max(
            FIXED_FRAMES_PER_BAR,
            Math.ceil(Math.max(1, Math.round(toNumber(lane.totalFrames, FIXED_FRAMES_PER_BAR))) / FIXED_FRAMES_PER_BAR) *
              FIXED_FRAMES_PER_BAR
          );

          let laneChanged = false;
          const nextNotes = lane.notes.map((note) => {
            if (!noteIdSet.has(note.id)) return note;
            const noteLength = Math.max(1, Math.round(toNumber(note.length, 1)));
            const maxStart = Math.max(0, laneFrames - noteLength);
            const nextStart = Math.max(
              0,
              Math.min(maxStart, Math.round(toNumber(note.startTime, 0)) + delta)
            );
            if (nextStart === note.startTime) return note;
            laneChanged = true;
            return { ...note, startTime: nextStart };
          });

          const nextChords = lane.chords.map((chord) => {
            if (!chordIdSet.has(chord.id)) return chord;
            const chordLength = Math.max(1, Math.round(toNumber(chord.length, 1)));
            const maxStart = Math.max(0, laneFrames - chordLength);
            const nextStart = Math.max(
              0,
              Math.min(maxStart, Math.round(toNumber(chord.startTime, 0)) + delta)
            );
            if (nextStart === chord.startTime) return chord;
            laneChanged = true;
            return { ...chord, startTime: nextStart };
          });

          if (!laneChanged) return lane;
          didChange = true;
          return {
            ...lane,
            notes: nextNotes,
            chords: nextChords,
            updatedAt: new Date().toISOString(),
          };
        });

        if (!didChange) return prev;
        const nextCanvas: CanvasSnapshot = {
          ...prev,
          editors: nextEditors,
          updatedAt: new Date().toISOString(),
        };
        recordCanvasHistory(prev, nextCanvas);
        return nextCanvas;
      });

      if (didChange) {
        setHasPendingCommit(true);
      }
      return didChange;
    },
    [canvas, laneSelectionById, recordCanvasHistory]
  );

  const stopGlobalPlaybackAudio = useCallback(() => {
    if (globalPlaybackAudioRef.current) {
      void globalPlaybackAudioRef.current.close();
      globalPlaybackAudioRef.current = null;
    }
    globalPlaybackMasterGainRef.current = null;
  }, []);

  const stopGlobalPlayback = useCallback(() => {
    if (globalPlaybackRafRef.current !== null) {
      window.cancelAnimationFrame(globalPlaybackRafRef.current);
      globalPlaybackRafRef.current = null;
    }
    globalPlaybackStartTimeRef.current = null;
    globalPlaybackEndFrameRef.current = null;
    globalPlaybackAudioStartRef.current = null;
    stopGlobalPlaybackAudio();
    setGlobalPlaybackIsPlaying(false);
  }, [stopGlobalPlaybackAudio]);

  useEffect(() => {
    stopGlobalPlayback();
    setGlobalPlaybackFrame(0);
  }, [editorId, stopGlobalPlayback]);

  const scheduleGlobalPlayback = useCallback(
    (startFrame: number) => {
      if (!canvas) return null;

      const getMidiFromTab = (lane: EditorSnapshot, tab: [number, number], fallback?: number) => {
        const fromRef = lane.tabRef?.[tab[0]]?.[tab[1]];
        if (fromRef !== undefined && fromRef !== null && Number.isFinite(Number(fromRef))) {
          return Number(fromRef);
        }
        if (fallback !== undefined && fallback !== null && Number.isFinite(Number(fallback))) {
          return Number(fallback);
        }
        const base = STANDARD_TUNING_MIDI[tab[0]];
        if (base !== undefined && Number.isFinite(tab[1]) && tab[1] >= 0) {
          return base + tab[1];
        }
        return 0;
      };

      const ctx = new AudioContext();
      void ctx.resume();
      const latencySec =
        (Number.isFinite(ctx.baseLatency) ? ctx.baseLatency : 0) +
        (Number.isFinite((ctx as AudioContext).outputLatency)
          ? (ctx as AudioContext).outputLatency
          : 0);
      const base = ctx.currentTime + latencySec;
      let endFrame = startFrame;
      const events: Array<{ start: number; duration: number; midi: number; gain: number }> = [];

      const pushEvent = (eventStart: number, eventLength: number, midi: number, gain: number) => {
        const roundedStart = Math.round(eventStart);
        const roundedEnd = Math.round(eventStart + eventLength);
        if (roundedEnd <= startFrame) return;
        const trimmedStart = Math.max(roundedStart, startFrame);
        const durationFrames = roundedEnd - trimmedStart;
        if (durationFrames <= 0) return;
        endFrame = Math.max(endFrame, roundedEnd);
        events.push({
          start: (trimmedStart - startFrame) / globalPlaybackFps,
          duration: durationFrames / globalPlaybackFps,
          midi,
          gain,
        });
      };

      canvas.editors.forEach((lane, index) => {
        const laneId = lane.id || `ed-${index + 1}`;
        if (trackMuteById[laneId]) return;

        lane.notes.forEach((note) => {
          const midi =
            Number.isFinite(note.midiNum) && note.midiNum > 0 ? note.midiNum : getMidiFromTab(lane, note.tab);
          pushEvent(note.startTime, note.length, midi, 0.55);
        });

        lane.chords.forEach((chord) => {
          chord.currentTabs.forEach((tab, tabIndex) => {
            const midi = getMidiFromTab(lane, tab, chord.originalMidi?.[tabIndex]);
            pushEvent(chord.startTime, chord.length, midi, 0.48);
          });
        });
      });

      if (!events.length) {
        void ctx.close();
        return null;
      }

      const master = ctx.createGain();
      master.gain.value = globalPlaybackVolume;
      master.connect(ctx.destination);
      globalPlaybackMasterGainRef.current = master;

      events.forEach((evt) => {
        if (!Number.isFinite(evt.midi) || evt.midi <= 0) return;
        const startAt = base + evt.start;
        const duration = Math.max(0.05, evt.duration);
        const stopAt = startAt + duration;
        const frequency = 440 * Math.pow(2, (evt.midi - 69) / 12);

        const osc = ctx.createOscillator();
        osc.type = "sine";
        osc.frequency.setValueAtTime(frequency, startAt);
        const amp = ctx.createGain();
        amp.gain.setValueAtTime(0, startAt);
        amp.gain.linearRampToValueAtTime(evt.gain, startAt + 0.01);
        amp.gain.setValueAtTime(evt.gain, Math.max(startAt + 0.01, stopAt - 0.01));
        amp.gain.linearRampToValueAtTime(0, stopAt);
        osc.connect(amp);
        amp.connect(master);
        osc.start(startAt);
        osc.stop(stopAt + 0.02);
      });

      return { ctx, endFrame, startTimeSec: base };
    },
    [canvas, globalPlaybackFps, globalPlaybackVolume, trackMuteById]
  );

  const startGlobalPlayback = useCallback(() => {
    if (!canvas) return;
    if (globalPlaybackRafRef.current !== null) return;
    const startFrame = Math.max(0, Math.min(canvasTimelineEnd, Math.round(globalPlaybackFrame)));
    stopGlobalPlaybackAudio();
    const scheduled = scheduleGlobalPlayback(startFrame);
    if (!scheduled?.ctx) {
      setGlobalPlaybackIsPlaying(false);
      return;
    }

    globalPlaybackAudioRef.current = scheduled.ctx;
    globalPlaybackAudioStartRef.current = scheduled.startTimeSec ?? null;
    globalPlaybackEndFrameRef.current = Math.max(startFrame, Math.round(scheduled.endFrame ?? startFrame));
    globalPlaybackStartFrameRef.current = startFrame;
    globalPlaybackStartTimeRef.current = performance.now();
    setGlobalPlaybackFrame(startFrame);
    setGlobalPlaybackIsPlaying(true);

    const tick = (now: number) => {
      if (globalPlaybackStartTimeRef.current === null) return;
      let elapsed = (now - globalPlaybackStartTimeRef.current) / 1000;
      if (globalPlaybackAudioRef.current && globalPlaybackAudioStartRef.current !== null) {
        elapsed = globalPlaybackAudioRef.current.currentTime - globalPlaybackAudioStartRef.current;
      }
      if (elapsed < 0) elapsed = 0;
      const nextFrame = globalPlaybackStartFrameRef.current + elapsed * globalPlaybackFps;
      const endFrame = globalPlaybackEndFrameRef.current ?? canvasTimelineEnd;
      if (nextFrame >= endFrame) {
        setGlobalPlaybackFrame(endFrame);
        stopGlobalPlayback();
        return;
      }
      setGlobalPlaybackFrame(nextFrame);
      globalPlaybackRafRef.current = window.requestAnimationFrame(tick);
    };

    globalPlaybackRafRef.current = window.requestAnimationFrame(tick);
  }, [
    canvas,
    canvasTimelineEnd,
    globalPlaybackFrame,
    globalPlaybackFps,
    scheduleGlobalPlayback,
    stopGlobalPlayback,
    stopGlobalPlaybackAudio,
  ]);

  const toggleGlobalPlayback = useCallback(() => {
    if (globalPlaybackIsPlaying) {
      stopGlobalPlayback();
      return;
    }
    startGlobalPlayback();
  }, [globalPlaybackIsPlaying, startGlobalPlayback, stopGlobalPlayback]);

  useEffect(() => {
    if (activeLaneId !== null) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTyping =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable ||
          target.closest("select"));
      if (isTyping) return;
      if (event.code === "Space") {
        event.preventDefault();
        toggleGlobalPlayback();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeLaneId, toggleGlobalPlayback]);

  const seekGlobalPlayback = useCallback(
    (frame: number) => {
      const clamped = Math.max(0, Math.min(canvasTimelineEnd, Math.round(frame)));
      if (globalPlaybackIsPlaying) {
        stopGlobalPlayback();
      }
      setGlobalPlaybackFrame(clamped);
    },
    [canvasTimelineEnd, globalPlaybackIsPlaying, stopGlobalPlayback]
  );

  const skipGlobalPlaybackToStart = useCallback(() => {
    seekGlobalPlayback(0);
  }, [seekGlobalPlayback]);

  const skipGlobalPlaybackBackwardBar = useCallback(() => {
    const current = Math.max(0, Math.floor(globalPlaybackFrame));
    const prevIndex = Math.floor((current - 1) / FIXED_FRAMES_PER_BAR);
    const target = Math.max(0, prevIndex * FIXED_FRAMES_PER_BAR);
    seekGlobalPlayback(target);
  }, [globalPlaybackFrame, seekGlobalPlayback]);

  const skipGlobalPlaybackForwardBar = useCallback(() => {
    const current = Math.max(0, Math.floor(globalPlaybackFrame));
    const nextIndex = Math.floor(current / FIXED_FRAMES_PER_BAR) + 1;
    const target = Math.min(canvasTimelineEnd, nextIndex * FIXED_FRAMES_PER_BAR);
    seekGlobalPlayback(target);
  }, [canvasTimelineEnd, globalPlaybackFrame, seekGlobalPlayback]);

  const handleGlobalPlaybackVolumeChange = useCallback((nextVolume: number) => {
    setGlobalPlaybackVolume(Math.max(0, Math.min(1, nextVolume)));
  }, []);

  const toggleTrackMute = useCallback((trackId: string) => {
    setTrackMuteById((prev) => ({ ...prev, [trackId]: !prev[trackId] }));
  }, []);

  useEffect(() => {
    if (!globalPlaybackIsPlaying) return;
    const resumeFrame = Math.max(0, Math.round(globalPlaybackFrameRef.current));
    stopGlobalPlayback();
    setGlobalPlaybackFrame(resumeFrame);
    const timer = window.setTimeout(() => {
      startGlobalPlayback();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [globalPlaybackIsPlaying, startGlobalPlayback, stopGlobalPlayback, trackMuteById]);

  useEffect(() => {
    if (!globalPlaybackAudioRef.current || !globalPlaybackMasterGainRef.current) return;
    const now = globalPlaybackAudioRef.current.currentTime;
    globalPlaybackMasterGainRef.current.gain.setTargetAtTime(globalPlaybackVolume, now, 0.02);
  }, [globalPlaybackVolume]);

  useEffect(() => {
    return () => {
      stopGlobalPlayback();
    };
  }, [stopGlobalPlayback]);

  useEffect(() => {
    if (!globalPlaybackIsPlaying) return;
    const scrollbar = globalTimelineScrollbarRef.current;
    if (!scrollbar) return;
    const maxScroll = Math.max(0, scrollbar.scrollWidth - scrollbar.clientWidth);
    if (maxScroll <= 0) return;

    const progress = Math.max(0, Math.min(1, globalPlaybackFrame / Math.max(1, canvasTimelineEnd)));
    const playheadX = progress * maxScroll;
    const left = scrollbar.scrollLeft;
    const right = left + scrollbar.clientWidth;
    const padding = Math.min(180, scrollbar.clientWidth * 0.25);
    if (playheadX < left + padding || playheadX > right - padding) {
      const target = Math.max(
        0,
        Math.min(maxScroll, playheadX - scrollbar.clientWidth * 0.35)
      );
      handleSharedTimelineScrollRatioChange(target / maxScroll);
    }
  }, [
    canvasTimelineEnd,
    globalPlaybackFrame,
    globalPlaybackIsPlaying,
    handleSharedTimelineScrollRatioChange,
  ]);

  return (
    <main className="page page-tight" onMouseDownCapture={handleMainMouseDownCapture}>
      <div className="container gte-wide stack pb-16">
        <div className="page-header">
          <div>
            <h1 className="page-title">GTE Workspace</h1>
            <div className="page-subtitle" style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
              <input
                type="text"
                value={nameDraft}
                onChange={(event) => setNameDraft(event.target.value)}
                onBlur={() => void commitName()}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void commitName();
                  }
                  if (event.key === "Escape") {
                    event.preventDefault();
                    setNameDraft(canvas?.name || "Untitled");
                  }
                }}
                className="w-64 max-w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-sm"
                placeholder="Untitled"
              />
              <label className="text-small muted" style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                Seconds/bar
                <input
                  type="number"
                  step="0.1"
                  min="0.1"
                  value={secondsDraft}
                  onChange={(event) => setSecondsDraft(event.target.value)}
                  onBlur={() => void commitSecondsPerBar()}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void commitSecondsPerBar();
                    }
                    if (event.key === "Escape") {
                      event.preventDefault();
                      setSecondsDraft(String(canvas?.secondsPerBar || DEFAULT_SECONDS_PER_BAR));
                    }
                  }}
                  className="w-24 rounded-md border border-slate-200 bg-white px-2 py-1 text-sm"
                />
              </label>
              <button
                type="button"
                onClick={() => setGlobalSnapToGridEnabled((prev) => !prev)}
                className={`rounded-md border px-2 py-1 text-xs font-semibold ${
                  globalSnapToGridEnabled
                    ? "border-emerald-300 bg-emerald-100 text-emerald-800"
                    : "border-slate-200 bg-white text-slate-600"
                }`}
                title="Global snap to grid for all tracks"
              >
                Snap to grid: {globalSnapToGridEnabled ? "On" : "Off"}
              </button>
              <button
                type="button"
                disabled
                className="rounded-md border border-slate-200 bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-500 opacity-80"
                title="Generate tabs is disabled for this update"
              >
                Generate tabs (Disabled)
              </button>
              {(nameSaving || secondsSaving) && !isGuestMode && <span className="muted text-small">Saving draft...</span>}
              {(nameError || secondsError) && <span className="error text-small">{nameError || secondsError}</span>}
              <span className="muted text-small">{saveStatus}</span>
            </div>
          </div>
          <div className="button-row">
            {isGuestMode ? (
              <>
                <Link href="/" className="button-secondary button-small">
                  Back home
                </Link>
                {session?.user?.id ? (
                  <button
                    type="button"
                    onClick={() => void router.push(saveToAccountPath)}
                    className="button-primary button-small"
                  >
                    Save draft to account
                  </button>
                ) : (
                  <>
                    <Link href={loginSaveHref} className="button-secondary button-small">
                      Log in to save
                    </Link>
                    <Link href={signupSaveHref} className="button-primary button-small">
                      Create account
                    </Link>
                  </>
                )}
              </>
            ) : (
              <>
                <button type="button" onClick={() => router.push("/gte")} className="button-secondary button-small">
                  Back to editors
                </button>
                <Link href="/account" className="button-secondary button-small">
                  Account
                </Link>
              </>
            )}
            <button
              type="button"
              onClick={() => void commitCanvasToBackend({ force: true })}
              className="button-primary button-small"
              disabled={savingCanvas || isGuestMode}
            >
              {savingCanvas ? "Saving..." : "Save now"}
            </button>
          </div>
        </div>

        {isGuestMode && (
          <div className="notice">
            Guest mode is local-only. This draft is saved in your browser until you import it into an account.
          </div>
        )}
        {loading && <p className="muted text-small">Loading editor...</p>}
        {error && <div className="error">{error}</div>}
        {saveError && <div className="error">{saveError}</div>}
        {canvas && (
          <div className="stack min-w-0 overflow-x-hidden space-y-2">
            {canvas.editors.map((lane, index) => {
              const laneId = lane.id || `ed-${index + 1}`;
              const laneEditorRef = buildLaneEditorRef(editorId, laneId);
              const isActive = laneId === activeLaneId;
              const isTrackMuted = Boolean(trackMuteById[laneId]);
              return (
                <section
                  key={laneId}
                  data-gte-track="true"
                  className="relative w-full min-w-0 max-w-full"
                  onMouseDownCapture={(event) => {
                    if (!event.shiftKey && activeLaneId !== laneId) {
                      setSelectionClearExemptEditorId(laneEditorRef);
                      setSelectionClearEpoch((prev) => prev + 1);
                    }
                    setActiveLaneId(laneId);
                  }}
                >
                  <div className="absolute top-1 left-1 z-20">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        toggleTrackMute(laneId);
                      }}
                      className={`rounded-md border px-2 py-1 text-[11px] ${
                        isTrackMuted
                          ? "border-amber-300 bg-amber-50 text-amber-700"
                          : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                      }`}
                      title={isTrackMuted ? "Unmute track" : "Mute track"}
                      aria-label={isTrackMuted ? "Unmute track" : "Mute track"}
                    >
                      {isTrackMuted ? (
                        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-current" aria-hidden="true">
                          <path d="M4 10v4h4l5 4V6L8 10H4z" />
                          <path d="M16 9.4l1.4-1.4L20 10.6l2.6-2.6L24 9.4 21.4 12l2.6 2.6-1.4 1.4-2.6-2.6-2.6 2.6-1.4-1.4 2.6-2.6-2.6-2.6z" />
                        </svg>
                      ) : (
                        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-current" aria-hidden="true">
                          <path d="M4 10v4h4l5 4V6L8 10H4z" />
                          <path d="M16 8a4 4 0 0 1 0 8v-2a2 2 0 0 0 0-4V8z" />
                        </svg>
                      )}
                    </button>
                  </div>
                  {canvas.editors.length > 1 && (
                    <div className="absolute top-1 right-1 z-20">
                      <button
                        type="button"
                        onClick={() => requestDeleteTrack(laneId)}
                        className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-50"
                        disabled={deletingLaneId === laneId}
                      >
                        {deletingLaneId === laneId ? "..." : "Remove track"}
                      </button>
                    </div>
                  )}
                  <GteWorkspace
                    editorId={laneEditorRef}
                    snapshot={lane}
                    onSnapshotChange={(nextSnapshot, options) =>
                      handleLaneSnapshotChange(laneId, nextSnapshot, options)
                    }
                    allowBackend={!isGuestMode}
                    embedded
                    isActive={isActive}
                    onFocusWorkspace={() => setActiveLaneId(laneId)}
                    globalSnapToGridEnabled={globalSnapToGridEnabled}
                    onGlobalSnapToGridEnabledChange={setGlobalSnapToGridEnabled}
                    sharedViewportBarCount={sharedViewportBarCount}
                    sharedTimelineScrollRatio={sharedTimelineScrollRatio}
                    onSharedTimelineScrollRatioChange={handleSharedTimelineScrollRatioChange}
                    historyUndoCount={canvasUndoCount}
                    historyRedoCount={canvasRedoCount}
                    onRequestUndo={handleCanvasUndo}
                    onRequestRedo={handleCanvasRedo}
                    globalPlaybackFrame={globalPlaybackFrame}
                    globalPlaybackIsPlaying={globalPlaybackIsPlaying}
                    globalPlaybackVolume={globalPlaybackVolume}
                    globalPlaybackTimelineEnd={canvasTimelineEnd}
                    onGlobalPlaybackToggle={toggleGlobalPlayback}
                    onGlobalPlaybackFrameChange={seekGlobalPlayback}
                    onGlobalPlaybackVolumeChange={handleGlobalPlaybackVolumeChange}
                    onGlobalPlaybackSkipToStart={skipGlobalPlaybackToStart}
                    onGlobalPlaybackSkipBackwardBar={skipGlobalPlaybackBackwardBar}
                    onGlobalPlaybackSkipForwardBar={skipGlobalPlaybackForwardBar}
                    showToolbarWhenInactive={activeLaneId === null && index === 0}
                    multiTrackSelectionActive={multiTrackSelectionActive}
                    onSelectionStateChange={(selection) =>
                      handleLaneSelectionStateChange(laneId, selection)
                    }
                    onRequestGlobalSelectedShift={(deltaFrames) =>
                      handleGlobalSelectedShift(laneId, deltaFrames)
                    }
                    selectionClearEpoch={selectionClearEpoch}
                    selectionClearExemptEditorId={selectionClearExemptEditorId}
                  />
                </section>
              );
            })}
            <div className="flex justify-center pt-1">
              <button
                type="button"
                onClick={() => void handleAddLane()}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-700 shadow-sm transition-colors hover:border-slate-400 hover:bg-slate-50 disabled:opacity-60 disabled:cursor-not-allowed"
                disabled={addingLane}
                title={addingLane ? "Adding track..." : "Add track"}
                aria-label={addingLane ? "Adding track" : "Add track"}
              >
                +
              </button>
            </div>
          </div>
        )}

        {canvas && (
          <div className="pointer-events-none fixed bottom-2 left-0 right-0 z-[130] px-4">
            <div className="pointer-events-auto mx-auto w-full max-w-[1700px] rounded-md border border-slate-200 bg-white/95 px-2 py-1 shadow-sm backdrop-blur">
              <div
                ref={globalTimelineScrollbarRef}
                className="overflow-x-scroll overflow-y-hidden"
                onScroll={handleGlobalTimelineScrollbarScroll}
              >
                <div style={{ width: globalTimelineTrackWidth, height: 1 }} />
              </div>
            </div>
          </div>
        )}
        {confirmDeleteTrackId && (
          <div className="fixed inset-0 z-[170] flex items-center justify-center bg-slate-900/30 px-4">
            <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-4 shadow-xl">
              <h2 className="text-base font-semibold text-slate-900">Remove track?</h2>
              <p className="mt-2 text-sm text-slate-600">
                This will permanently delete the track and its notes/chords. You cannot undo this action.
              </p>
              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  className="button-secondary button-small"
                  onClick={() => setConfirmDeleteTrackId(null)}
                  disabled={Boolean(deletingLaneId)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="button-danger button-small"
                  onClick={() => void handleDeleteLane(confirmDeleteTrackId)}
                  disabled={Boolean(deletingLaneId)}
                >
                  {deletingLaneId === confirmDeleteTrackId ? "Removing..." : "Remove track"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const editorId = `${ctx.params?.editor_id || ""}`;
  const normalizedEditorId = editorId.trim().toLowerCase();
  if (normalizedEditorId === GTE_GUEST_EDITOR_ID) {
    return { props: { editorId: GTE_GUEST_EDITOR_ID, isGuestMode: true } };
  }

  const session = await getServerSession(ctx.req, ctx.res, authOptions);
  if (!session?.user?.id) {
    return {
      redirect: {
        destination: "/auth/login",
        permanent: false,
      },
    };
  }
  return { props: { editorId, isGuestMode: false } };
};
