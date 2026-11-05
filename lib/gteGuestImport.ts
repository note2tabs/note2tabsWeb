import type { CanvasSnapshot, EditorSnapshot } from "../types/gte";
import { gteApi } from "./gteApi";
import { readGuestCanvasDraft } from "./gteGuestCanvasDraft";
import { readGuestDraft, GTE_GUEST_EDITOR_ID } from "./gteGuestDraft";

export function guestImportCanvas(source: CanvasSnapshot | EditorSnapshot): CanvasSnapshot {
  if ("editors" in source && Array.isArray(source.editors)) return source as CanvasSnapshot;
  const lane = source as EditorSnapshot;
  return { id: GTE_GUEST_EDITOR_ID, name: lane.name, secondsPerBar: lane.secondsPerBar,
    editors: [{ ...lane, id: "ed-1" }] };
}

export function hasGuestCanvasContent(canvas: CanvasSnapshot): boolean {
  return (canvas.name || "Untitled") !== "Untitled" || canvas.editors.some(lane =>
    lane.notes.length > 0 || lane.chords.length > 0 || lane.cutPositionsWithCoords.length > 1 ||
    (lane.notation?.rests?.length ?? 0) > 0 || (lane.drumLoops?.length ?? 0) > 0);
}

export async function loadGuestImportDraft(): Promise<CanvasSnapshot | null> {
  const local = readGuestCanvasDraft();
  if (local && hasGuestCanvasContent(local)) return local;
  let legacy: EditorSnapshot | null = null;
  try { legacy = readGuestDraft(); } catch { /* Storage may be blocked. */ }
  if (legacy) {
    const canvas = guestImportCanvas(legacy);
    if (hasGuestCanvasContent(canvas)) return canvas;
  }
  try {
    const canvas = guestImportCanvas(await gteApi.getEditor(GTE_GUEST_EDITOR_ID));
    return hasGuestCanvasContent(canvas) ? canvas : null;
  } catch { return null; }
}

// Compare musical content, not server-assigned versions or timestamps. A successful
// HTTP response alone must never authorize deleting the user's only working copy.
function music(canvas: CanvasSnapshot): string {
  return JSON.stringify(canvas.editors.map(lane => ({
    id: lane.id, totalFrames: lane.totalFrames,
    notes: lane.notes.map(n => [n.id, n.startTime, n.length, n.midiNum, n.tab]).sort((a,b) => Number(a[0])-Number(b[0])),
    chords: lane.chords.map(c => [c.id, c.startTime, c.length, c.currentTabs, c.originalMidi]).sort((a,b) => Number(a[0])-Number(b[0])),
  })));
}

export async function saveGuestCanvasToAccount(draft: CanvasSnapshot): Promise<string> {
  const created = await gteApi.createEditor(undefined, draft.name || "Untitled");
  const payload: CanvasSnapshot = { ...draft, id: created.editorId,
    name: created.snapshot?.name || draft.name || "Untitled" };
  await gteApi.applySnapshot(created.editorId, payload);
  await gteApi.commitEditor(created.editorId);
  const saved = guestImportCanvas(await gteApi.getEditor(created.editorId));
  if (music(saved) !== music(payload)) {
    throw new Error("We could not verify that every track, note and chord was saved. Your browser draft is still on this device. Please try again.");
  }
  return created.editorId;
}
