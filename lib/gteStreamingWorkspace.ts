import type { CanvasSnapshot, EditorSnapshot } from "../types/gte";
import { importedInstrument } from "./gteImportedInstrument";
import { synthesizeTimingMap } from "./gteTiming";

export type StreamingWorkspaceBinding = {
  canvas: CanvasSnapshot;
  name: string;
  progress: number;
  finishing: boolean;
  stage?: string;
  onInteractionStart?: () => void;
  onChange: (before: CanvasSnapshot, next: CanvasSnapshot) => void;
  undo: () => void;
  redo: () => void;
  undoCount: number;
  redoCount: number;
};
type EditorApi = typeof import("./gteApi").gteApi;
const clone = <T,>(value: T): T => structuredClone(value);

/** Local persistence boundary for the real editor while inference is in progress.
 * Never fall back to saved/guest endpoints for an unfinished transcription. */
export function createStreamingWorkspaceApi(read: () => CanvasSnapshot | null): EditorApi {
  const current = () => { const value = read(); if (!value) throw new Error("Waiting for transcription"); return clone(value); };
  const response = (canvas: CanvasSnapshot) => ({ ok: true, canvas, snapshot: canvas });
  const methods: Record<string, (...args: any[]) => any> = {
    getEditor: async () => current(),
    commitEditor: async () => response(current()),
    applySnapshot: async (ref: string, value: CanvasSnapshot | EditorSnapshot) => {
      const canvas = current();
      if ("editors" in value) return response(clone(value));
      const id = ref.split("__ed__")[1] ?? value.id;
      canvas.editors = canvas.editors.map(lane => lane.id === id ? clone(value) : lane);
      return response(canvas);
    },
    setEditorName: async (ref: string, name: string) => {
      const canvas = current(), id = ref.split("__ed__")[1];
      if (id) canvas.editors = canvas.editors.map(lane => lane.id === id ? { ...lane, name } : lane);
      else canvas.name = name;
      return response(canvas);
    },
    setSecondsPerBar: async (_: string, secondsPerBar: number) => {
      const canvas = current(); canvas.secondsPerBar = secondsPerBar;
      canvas.editors = canvas.editors.map(lane => ({ ...lane, secondsPerBar, fps: 480 / secondsPerBar }));
      canvas.timingMap = synthesizeTimingMap(secondsPerBar, Math.max(480, ...canvas.editors.map(lane => lane.totalFrames)), canvas.editors[0]?.timeSignature || 4, canvas.editors[0]?.timeSignatureBottom || 4);
      return response(canvas);
    },
    setEditorInputSettings: async (_: string, settings: CanvasSnapshot["editorInputSettings"]) => ({ ok: true, settings }),
    setActiveLane: async (_: string, laneId: string) => ({ ok: true, laneId }),
    addCanvasEditor: async (_: string, name?: string, options?: { editorType?: string }) => {
      const canvas = current(), kind = options?.editorType ?? "tab", first = canvas.editors[0];
      const instrument = importedInstrument({ name: kind === "piano" ? "Piano" : kind, program: kind === "bass" ? 33 : kind === "piano" ? 0 : 25, trackType: kind === "drums" ? "drums" : "tab" });
      const editor: EditorSnapshot = { ...clone(first), ...instrument, id: `user-${crypto.randomUUID()}`, name: name || (kind === "piano" ? "Piano" : kind === "bass" ? "Bass" : kind === "drums" ? "Drums" : kind === "chords" ? "Chords" : "Guitar"),
        editorType: kind, trackType: kind, program: kind === "bass" ? 33 : kind === "piano" ? 0 : 25,
        fps: first?.fps || 240, totalFrames: first?.totalFrames || 480, framesPerMessure: 480,
        notes: [], chords: [], noteEffects: [], notation: {}, drumLoops: [], cutPositionsWithCoords: [], optimalsByTime: {} };
      canvas.editors.push(editor); return { ...response(canvas), editor };
    },
  };
  return new Proxy(methods, { get: (target, name: string) => target[name] ?? (() => Promise.reject(new Error("This action is available when transcription finishes."))) }) as EditorApi;
}

/** Incoming source metadata never chooses a different track for the musician. */
export function streamingActiveLane(current: string | null, canvas: CanvasSnapshot) {
  if (current && canvas.editors.some(lane => lane.id === current)) return current;
  const priority = (lane: EditorSnapshot) => lane.instrumentType === "guitar-tab" ? 0 : lane.instrumentType === "bass-tab" ? 1 : lane.instrumentType === "notation" ? 2 : 3;
  return [...canvas.editors].sort((a,b) => priority(a) - priority(b))[0]?.id ?? null;
}
