// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createGuestSnapshot, GTE_GUEST_DRAFT_STORAGE_KEY, writeGuestDraft } from "../../lib/gteGuestDraft";
import { GTE_GUEST_CANVAS_STORAGE_KEY, readGuestCanvasDraft, writeGuestCanvasDraft } from "../../lib/gteGuestCanvasDraft";
import { clearImportedGuestDraft, isCurrentGuestImportDraft, loadGuestImportDraft, saveGuestCanvasToAccount } from "../../lib/gteGuestImport";
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
beforeEach(()=>{localStorage.clear();vi.resetAllMocks();});
afterEach(() => vi.restoreAllMocks());

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
  expect(gteApi.applySnapshot).toHaveBeenCalledWith("saved",{...saved,editors:saved.editors.map(lane=>({...lane,version:(lane.version ?? 1)+1}))});
  expect(gteApi.commitEditor).toHaveBeenCalledWith("saved");
  expect(readGuestCanvasDraft()).toEqual(original);
 });
 it("advances versions beyond the new destination canvas instead of reusing guest revisions",async()=>{
  const original=draft();original.editors[1].version=1;
  const destination={...draft(),editors:draft().editors.map(lane=>({...lane,version:8,notes:[],chords:[]}))};
  vi.mocked(gteApi.createEditor).mockResolvedValue({editorId:"saved",snapshot:destination});
  vi.mocked(gteApi.getEditor).mockResolvedValue(original);
  await saveGuestCanvasToAccount(original);
  const payload=vi.mocked(gteApi.applySnapshot).mock.calls[0][1] as CanvasSnapshot;
  expect(payload.editors.map(l=>l.version)).toEqual([9,9]);
  expect(payload.editors[1].notes).toEqual(original.editors[1].notes);
  expect(original.editors[1].version).toBe(1);
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


describe("guest import safety edge cases", () => {
 it.each(["{bad json", JSON.stringify({canvas:{editors:[null]}}), JSON.stringify({canvas:{editors:[{id:"ed-1"}]}})])("rejects corrupt drafts without replacing them with an older copy: %s", async raw => {
   localStorage.setItem(GTE_GUEST_CANVAS_STORAGE_KEY,raw);
   vi.mocked(gteApi.getEditor).mockResolvedValue(draft());
   await expect(loadGuestImportDraft()).rejects.toThrow("not been removed");
   expect(localStorage.getItem(GTE_GUEST_CANVAS_STORAGE_KEY)).toBe(raw);
   expect(gteApi.getEditor).not.toHaveBeenCalled();
 });
 it("reports blocked browser storage without importing an unknown fallback", async () => {
   vi.spyOn(Storage.prototype,"getItem").mockImplementation(()=>{throw new DOMException("Blocked","SecurityError");});
   await expect(loadGuestImportDraft()).rejects.toThrow("not been removed");
   expect(gteApi.getEditor).not.toHaveBeenCalled();
 });
 it("supports unwrapped browser drafts and legacy single-track drafts",async()=>{
   const original=draft();localStorage.setItem(GTE_GUEST_CANVAS_STORAGE_KEY,JSON.stringify(original));
   expect(await loadGuestImportDraft()).toEqual(original);
   localStorage.removeItem(GTE_GUEST_CANVAS_STORAGE_KEY);
   writeGuestDraft(original.editors[1]);
   expect((await loadGuestImportDraft())?.editors[0]).toMatchObject({id:"ed-1",notes:original.editors[1].notes,chords:expect.any(Array)});
   expect(localStorage.getItem(GTE_GUEST_DRAFT_STORAGE_KEY)).not.toBeNull();
 });
 it.each(["createEditor","applySnapshot","commitEditor","getEditor"] as const)("retains the source if %s fails",async step=>{
   const original=draft();writeGuestCanvasDraft(original);
   vi.mocked(gteApi.createEditor).mockResolvedValue({editorId:"saved",snapshot:original});
   vi.mocked(gteApi.getEditor).mockResolvedValue({...original,id:"saved"});
   vi.mocked(gteApi[step]).mockRejectedValueOnce(new Error("connection lost"));
   await expect(saveGuestCanvasToAccount(original)).rejects.toThrow("connection lost");
   expect(readGuestCanvasDraft()).toEqual(original);
 });
 it.each(["missing track","missing note","changed pitch","changed fret","missing chord"])("does not trust successful HTTP responses with %s",async change=>{
   const original=draft();writeGuestCanvasDraft(original);
   const saved=JSON.parse(JSON.stringify(original)) as CanvasSnapshot;
   if(change==="missing track") saved.editors.pop();
   if(change==="missing note") saved.editors[1].notes=[];
   if(change==="changed pitch") saved.editors[1].notes[0].midiNum++;
   if(change==="changed fret") saved.editors[1].notes[0].tab[1]++;
   if(change==="missing chord") saved.editors[1].chords=[];
   vi.mocked(gteApi.createEditor).mockResolvedValue({editorId:"saved",snapshot:original});
   vi.mocked(gteApi.getEditor).mockResolvedValue(saved);
   await expect(saveGuestCanvasToAccount(original)).rejects.toThrow("could not verify");
   expect(readGuestCanvasDraft()).toEqual(original);
 });
 it("bypasses editor prefetches when verifying a completed save",async()=>{
   const original=draft();vi.mocked(gteApi.createEditor).mockResolvedValue({editorId:"saved",snapshot:original});
   vi.mocked(gteApi.getEditor).mockResolvedValue(original);
   await saveGuestCanvasToAccount(original);
   expect(gteApi.getEditor).toHaveBeenCalledWith("saved",{fresh:true});
 });
 it("does not clear a draft another tab edited during import",()=>{
   const original=draft();writeGuestCanvasDraft(original);
   const changed=draft();changed.editors[1].notes[0].tab=[0,7];writeGuestCanvasDraft(changed);
   expect(isCurrentGuestImportDraft(original)).toBe(false);
   expect(clearImportedGuestDraft(original)).toBe(false);
   expect(readGuestCanvasDraft()).toEqual(changed);
 });
 it("cleans up old bare single-track records without timestamps only after successful import",async()=>{
   const legacy=draft().editors[1];delete legacy.updatedAt;
   localStorage.setItem(GTE_GUEST_DRAFT_STORAGE_KEY,JSON.stringify(legacy));
   const loaded=await loadGuestImportDraft();expect(loaded).not.toBeNull();
   expect(clearImportedGuestDraft(loaded!)).toBe(true);
   expect(localStorage.getItem(GTE_GUEST_DRAFT_STORAGE_KEY)).toBeNull();
 });
 it("clears only the successfully imported, unchanged browser copy",()=>{
   const original=draft();writeGuestCanvasDraft(original);
   expect(clearImportedGuestDraft(original)).toBe(true);
   expect(readGuestCanvasDraft()).toBeNull();
 });
});
