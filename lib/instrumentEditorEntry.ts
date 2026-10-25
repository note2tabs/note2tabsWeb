import { gteApi } from "./gteApi";
import { ensureBassEditorEntry } from "./bassEditorEntry";
import { isNotationTrack } from "./gteNotation";
import type { CanvasSnapshot, EditorSnapshot } from "../types/gte";

export const EDITOR_ENTRY_INSTRUMENTS = ["bass", "piano", "drums", "ukulele"] as const;
export type EditorEntryInstrument = typeof EDITOR_ENTRY_INSTRUMENTS[number];
export function editorEntryInstrument(value: unknown): EditorEntryInstrument | undefined {
  return EDITOR_ENTRY_INSTRUMENTS.find(instrument => instrument === value);
}
const pending = new Map<string, Promise<CanvasSnapshot>>();
const matches = (lane: EditorSnapshot, instrument: EditorEntryInstrument) => instrument === "piano"
  ? isNotationTrack(lane) && /piano/.test(String(lane.instrumentId || lane.chordEditor?.instrumentSound || ""))
  : instrument === "ukulele" ? lane.tuning?.presetId?.startsWith("ukulele-")
  : [lane.trackType, lane.editorType, lane.type].includes(instrument);

/** Preserve existing guest work and select an instrument-specific track only on explicit entry. */
export async function ensureInstrumentEditorEntry(editorId: string, canvas: CanvasSnapshot, instrument: EditorEntryInstrument): Promise<CanvasSnapshot> {
  if (instrument === "bass") return ensureBassEditorEntry(editorId, canvas);
  const existing = canvas.editors.find(lane => matches(lane, instrument));
  if (existing) return { ...canvas, activeLaneId: existing.id };
  const key = `${editorId}:${instrument}`;
  if (pending.has(key)) return pending.get(key)!;
  const task = (async () => {
    const kind = instrument === "drums" ? "drums" : "tab";
    const result = await gteApi.addCanvasEditor(editorId, {piano: "Piano", drums: "Drums", ukulele: "Ukulele"}[instrument], {
      editorType: kind, trackType: kind, type: kind,
      ...(instrument === "piano" ? { chordEditor: { instrumentType: "notation", instrumentSound: "upright_piano", notation: { assignments: {} } } } : {}),
    });
    const reference = canvas.editors[0];
    const secondsPerBar = canvas.secondsPerBar ?? reference?.secondsPerBar ?? result.canvas.secondsPerBar;
    const next = { ...result.canvas, secondsPerBar, activeLaneId: result.editor.id,
      editors: result.canvas.editors.map(lane => lane.id === result.editor.id ? {
        ...lane, version: (lane.version ?? 1) + 1, secondsPerBar,
        timeSignature: reference?.timeSignature ?? lane.timeSignature,
        timeSignatureBottom: reference?.timeSignatureBottom ?? lane.timeSignatureBottom,
        ...(instrument === "piano" ? { instrumentId: "upright_piano", chordEditor: { ...lane.chordEditor, instrumentType: "notation" as const, instrumentSound: "upright_piano", notation: { assignments: {} } } } : {}),
        ...(instrument === "ukulele" ? { maxFret: 20, tuning: { presetId: "ukulele-high-g", label: "Ukulele high G", openStringMidi: [69, 64, 60, 67], capo: 0 } } : {}),
      } : lane),
    };
    const saved = await gteApi.applySnapshot(editorId, next);
    const committed = editorId === "local" ? undefined : (await gteApi.commitEditor(editorId)).snapshot;
    return { ...(committed ?? saved.canvas ?? next), activeLaneId: result.editor.id };
  })();
  pending.set(key, task);
  try { return await task; } finally { pending.delete(key); }
}
