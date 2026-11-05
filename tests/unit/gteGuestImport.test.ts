// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createGuestSnapshot } from "../../lib/gteGuestDraft";
import { readGuestCanvasDraft, writeGuestCanvasDraft } from "../../lib/gteGuestCanvasDraft";
import { loadGuestImportDraft, saveGuestCanvasToAccount } from "../../lib/gteGuestImport";
import { gteApi } from "../../lib/gteApi";
import type { CanvasSnapshot } from "../../types/gte";
vi.mock("../../lib/gteApi", () => ({gteApi: {
 getEditor:vi.fn(), createEditor:vi.fn(), applySnapshot:vi.fn(), commitEditor:vi.fn(),
}}));
const draft = (): CanvasSnapshot => ({id:"local", name:"My song", secondsPerBar:2, editors:[
 {...createGuestSnapshot("ed-1"),totalFrames:1920},
 {...createGuestSnapshot("ed-2"),name:"Guitar",totalFrames:1920,
 notes:[{id:1,startTime:120,length:60,midiNum:64,tab:[0,0],optimals:[]}],
 chords:[{id:2,startTime:240,length:120,currentTabs:[[1,2],[2,2]],ogTabs:[[1,2],[2,2]],originalMidi:[61,57]}]},
]});
beforeEach(()=>{localStorage.clear();vi.clearAllMocks();});
describe("guest draft account import",()=>{
 it("restores a populated single-track draft instead of the named blank server copy",async()=>{
  const original=draft();original.editors=[original.editors[1]];
  writeGuestCanvasDraft(original);
  const blank={...original,editors:[{...original.editors[0],notes:[],chords:[]}]};
  vi.mocked(gteApi.getEditor).mockResolvedValue(blank);
  // Previously its name made the blank session win over browser storage.
  expect(blank.name).toBe("My song");
  expect(blank.editors[0].totalFrames).toBe(original.editors[0].totalFrames);
  expect(await loadGuestImportDraft()).toEqual(original);
 });
 it("restores all browser tracks when the temporary server returns an equally long blank first track",async()=>{
  const original=draft();writeGuestCanvasDraft(original);
  vi.mocked(gteApi.getEditor).mockResolvedValue({...original,editors:[original.editors[0]]});
  // The previous importer selected only server.editors[0], losing every note.
  expect(original.editors[0].notes).toHaveLength(0);
  const loaded=await loadGuestImportDraft();
  expect(loaded).toEqual(original);
  expect(loaded!.editors[1].notes).toHaveLength(1);
  expect(gteApi.getEditor).not.toHaveBeenCalled();
 });
 it("imports every track and verifies a reload before allowing draft cleanup",async()=>{
  const original=draft();writeGuestCanvasDraft(original);
  const saved={...original,id:"saved",name:"My song (2)"};
  vi.mocked(gteApi.createEditor).mockResolvedValue({editorId:"saved",snapshot:saved});
  vi.mocked(gteApi.getEditor).mockResolvedValue(saved);
  await expect(saveGuestCanvasToAccount(original)).resolves.toBe("saved");
  expect(gteApi.applySnapshot).toHaveBeenCalledWith("saved",saved);
  expect(gteApi.commitEditor).toHaveBeenCalledWith("saved");
  expect(readGuestCanvasDraft()).toEqual(original);
 });
 it("rejects a blank successful save and retains the recoverable browser draft",async()=>{
  const original=draft();writeGuestCanvasDraft(original);
  vi.mocked(gteApi.createEditor).mockResolvedValue({editorId:"saved",snapshot:{...original,id:"saved"}});
  vi.mocked(gteApi.getEditor).mockResolvedValue({...original,id:"saved",editors:original.editors.map(l=>({...l,notes:[],chords:[]}))});
  await expect(saveGuestCanvasToAccount(original)).rejects.toThrow("every track, note and chord");
  expect(readGuestCanvasDraft()).toEqual(original);
 });
 it("retains the draft when a save or commit fails",async()=>{
  const original=draft();writeGuestCanvasDraft(original);
  vi.mocked(gteApi.createEditor).mockResolvedValue({editorId:"saved",snapshot:original});
  vi.mocked(gteApi.commitEditor).mockRejectedValueOnce(new Error("offline"));
  await expect(saveGuestCanvasToAccount(original)).rejects.toThrow("offline");
  expect(readGuestCanvasDraft()).toEqual(original);
 });
 it("retains all server tracks for older sessions without browser storage",async()=>{
  const original=draft();vi.mocked(gteApi.getEditor).mockResolvedValue(original);
  expect(await loadGuestImportDraft()).toEqual(original);
 });
});
