import { gteApi } from "./gteApi";
import { isBassSnapshot } from "./gteTuning";
import type { CanvasSnapshot } from "../types/gte";

/** Add bass to the loaded project, including restored guest work, without replacing tracks. */
const pendingEntries = new Map<string, Promise<CanvasSnapshot>>();
export async function ensureBassEditorEntry(editorId: string, canvas: CanvasSnapshot): Promise<CanvasSnapshot> {
  const existing = canvas.editors.find(isBassSnapshot);
  if (existing) return { ...canvas, activeLaneId: existing.id };
  const pending = pendingEntries.get(editorId);
  if (pending) return pending;
  const task = (async () => {
    const result = await gteApi.addCanvasEditor(editorId, "Bass", {
      editorType: "bass", trackType: "bass", type: "bass",
    });
    const reference = canvas.editors[0];
    const secondsPerBar = canvas.secondsPerBar ?? reference?.secondsPerBar ?? result.canvas.secondsPerBar;
    const next = { ...result.canvas, secondsPerBar, activeLaneId: result.editor.id,
      editors: result.canvas.editors.map(lane => lane.id === result.editor.id ? {
        ...lane, secondsPerBar,
        timeSignature: reference?.timeSignature ?? lane.timeSignature,
        timeSignatureBottom: reference?.timeSignatureBottom ?? lane.timeSignatureBottom,
      } : lane),
    };
    await gteApi.applySnapshot(editorId, next);
    return next;
  })();
  pendingEntries.set(editorId, task);
  try { return await task; }
  finally { pendingEntries.delete(editorId); }
}
