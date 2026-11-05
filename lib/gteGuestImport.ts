import type { CanvasSnapshot, EditorSnapshot } from "../types/gte";
import { restoreNotationSnapshot } from "./gteNotationPersistence";
import { gteApi } from "./gteApi";
import { clearGuestCanvasDraft, readGuestCanvasDraft } from "./gteGuestCanvasDraft";
import { clearGuestDraft, readGuestDraft, GTE_GUEST_EDITOR_ID } from "./gteGuestDraft";

export function guestImportCanvas(source: CanvasSnapshot | EditorSnapshot): CanvasSnapshot {
  if (!source || typeof source !== "object") throw new Error("Invalid guest draft response.");
  if ("editors" in source && Array.isArray(source.editors)) return source as CanvasSnapshot;
  const lane = source as EditorSnapshot;
  return { id: GTE_GUEST_EDITOR_ID, name: lane.name, secondsPerBar: lane.secondsPerBar,
    editors: [{ ...lane, id: "ed-1" }] };
}

export function hasGuestCanvasContent(canvas: CanvasSnapshot): boolean {
  return (canvas.name || "Untitled") !== "Untitled" || canvas.editors.some(raw => {
    const lane = restoreNotationSnapshot(raw);
    return lane.notes.length > 0 || lane.chords.length > 0 || (lane.cutPositionsWithCoords?.length ?? 0) > 1 ||
    (lane.notation?.rests?.length ?? 0) > 0 || (lane.drumLoops?.length ?? 0) > 0;
  });
}

export async function loadGuestImportDraft(): Promise<CanvasSnapshot | null> {
  const local = readGuestCanvasDraft({ strict: true });
  if (local && hasGuestCanvasContent(local)) return local;
  let legacy: EditorSnapshot | null = null;
  try { legacy = readGuestDraft(); } catch { /* Storage may be blocked. */ }
  if (legacy) {
    const canvas = guestImportCanvas(legacy);
    if (hasGuestCanvasContent(canvas)) return canvas;
  }
  try {
    const canvas = guestImportCanvas(await gteApi.getEditor(GTE_GUEST_EDITOR_ID, { fresh: true }));
    return hasGuestCanvasContent(canvas) ? canvas : null;
  } catch { return null; }
}

// Compare musical content, not server-assigned versions or timestamps. A successful
// HTTP response alone must never authorize deleting the user's only working copy.
function music(canvas: CanvasSnapshot) {
  return {
    keyBase: canvas.keyBase, keyType: canvas.keyType, secondsPerBar: canvas.secondsPerBar,
    timingMap: canvas.timingMap,
    editors: canvas.editors.map(raw => {
      const lane = restoreNotationSnapshot(raw);
      return {
        id: lane.id, name: lane.name, instrumentId: lane.instrumentId, totalFrames: lane.totalFrames,
        timeSignature: lane.timeSignature, timeSignatureBottom: lane.timeSignatureBottom,
        tuning: lane.tuning,
        notes: lane.notes.map(n => ({id:n.id, start:n.startTime, length:n.length, midi:n.midiNum, tab:n.tab,
          voice:n.notationVoice, staff:n.notationStaff, pitchBend:n.pitchBend ?? [], vibrato:n.vibrato === true, vibratoSettings:n.vibrato ? n.vibratoSettings : undefined})).sort((a,b) => a.id-b.id),
        chords: lane.chords.map(c => ({id:c.id,start:c.startTime,length:c.length,tabs:c.currentTabs,midis:c.originalMidi,
          voice:c.notationVoice,memberVoices:c.notationMemberVoices,root:c.root,quality:c.quality,label:c.label,strums:c.strums?.length ? c.strums : undefined})).sort((a,b) => a.id-b.id),
        effects: (lane.noteEffects ?? []).map(e => ({type:e.type,start:e.startNoteId,end:e.endNoteId,label:e.noteEffectLabel})),
        rests: lane.notation?.rests, ties: lane.notation?.ties, slurs: lane.notation?.slurs,
        loops: lane.drumLoops?.length ? lane.drumLoops : undefined,
      };
    }),
  };
}

// Server defaults and object-key order are harmless; missing/changed music is not.
function preserves(actual: unknown, expected: unknown): boolean {
  if (expected === undefined) return true;
  if (typeof actual === "number" && typeof expected === "number") return Math.abs(actual-expected) < 1e-7;
  if (Array.isArray(expected)) return Array.isArray(actual) && actual.length === expected.length && expected.every((v,i) => preserves(actual[i],v));
  if (expected && typeof expected === "object") return !!actual && typeof actual === "object" && Object.entries(expected).every(([key,value]) => preserves((actual as Record<string,unknown>)[key],value));
  return actual === expected;
}

export function isCurrentGuestImportDraft(draft: CanvasSnapshot): boolean {
  try {
    const current = readGuestCanvasDraft({ strict: true });
    if (current) return JSON.stringify(current) === JSON.stringify(draft);
    const legacy = readGuestDraft();
    // Old bare single-track records may not contain updatedAt; decoding those
    // generates a timestamp, which must not make an unchanged draft look edited.
    const identity = (value: unknown) => JSON.stringify(value, (key, entry) => key === "updatedAt" ? undefined : entry);
    return !legacy || identity(guestImportCanvas(legacy)) === identity(draft);
  } catch { return false; }
}

export function clearImportedGuestDraft(draft: CanvasSnapshot): boolean {
  if (!isCurrentGuestImportDraft(draft)) return false;
  try { clearGuestCanvasDraft(); clearGuestDraft(); return true; } catch { return false; }
}

export async function saveGuestCanvasToAccount(draft: CanvasSnapshot): Promise<string> {
  const created = await gteApi.createEditor(undefined, draft.name || "Untitled");
  const payload: CanvasSnapshot = { ...draft, id: created.editorId,
    name: created.snapshot?.name || draft.name || "Untitled" };
  await gteApi.applySnapshot(created.editorId, payload);
  await gteApi.commitEditor(created.editorId);
  const saved = guestImportCanvas(await gteApi.getEditor(created.editorId, { fresh: true }));
  if (!preserves(music(saved), music(payload))) {
    throw new Error("We could not verify that every track, note and chord was saved. Your browser draft is still on this device. Please try again.");
  }
  return created.editorId;
}
