import { beforeEach, expect, it, vi } from "vitest";
const api = vi.hoisted(() => ({ addCanvasEditor: vi.fn(), applySnapshot: vi.fn() }));
vi.mock("../../lib/gteApi", () => ({ gteApi: api }));
import { ensureBassEditorEntry } from "../../lib/bassEditorEntry";
import type { CanvasSnapshot } from "../../types/gte";

const guitar = { id: "guitar", trackType: "tab", notes: [{ id: 7, midiNum: 64 }] };
const bass = { id: "bass", trackType: "bass", notes: [] };
const canvas = { id: "local", editors: [guitar] } as unknown as CanvasSnapshot;
beforeEach(() => {
  api.addCanvasEditor.mockReset().mockResolvedValue({ editor: bass, canvas: { ...canvas, editors: [guitar, bass] } });
  api.applySnapshot.mockReset().mockResolvedValue({ ok: true });
});
it("opens bass while preserving all pre-existing guest or signed-in tracks", async () => {
  const result = await ensureBassEditorEntry("local", canvas);
  expect(result.editors[0]).toEqual(guitar);
  expect(result.activeLaneId).toBe("bass");
  expect(api.addCanvasEditor).toHaveBeenCalledExactlyOnceWith("local", "Bass", { editorType: "bass", trackType: "bass", type: "bass" });
  expect(api.applySnapshot).toHaveBeenCalledExactlyOnceWith("local", result);
});
it("reuses an existing bass track without creating duplicates", async () => {
  const result = await ensureBassEditorEntry("local", { ...canvas, editors: [guitar, bass] } as unknown as CanvasSnapshot);
  expect(result.activeLaneId).toBe("bass");
  expect(api.addCanvasEditor).not.toHaveBeenCalled();
});
it("shares an in-flight entry so duplicate loads create only one bass track", async () => {
  const [one, two] = await Promise.all([ensureBassEditorEntry("local", canvas), ensureBassEditorEntry("local", canvas)]);
  expect(one).toEqual(two);
  expect(api.addCanvasEditor).toHaveBeenCalledTimes(1);
});
it("allows a retry when track creation fails", async () => {
  api.addCanvasEditor.mockRejectedValueOnce(new Error("connection failed"));
  await expect(ensureBassEditorEntry("local", canvas)).rejects.toThrow("connection failed");
  await expect(ensureBassEditorEntry("local", canvas)).resolves.toMatchObject({ activeLaneId: "bass" });
});
it("keeps the existing song tempo and meter on the new bass track", async () => {
  const song = { ...canvas, secondsPerBar: 3, editors: [{ ...guitar, timeSignature: 3, timeSignatureBottom: 4 }] } as unknown as CanvasSnapshot;
  const result = await ensureBassEditorEntry("custom-song", song);
  expect(result.editors.find(lane => lane.id === "bass")).toMatchObject({ secondsPerBar: 3, timeSignature: 3, timeSignatureBottom: 4 });
});
