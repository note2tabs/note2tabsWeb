import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
const source=ts.createSourceFile("index.tsx",readFileSync("pages/gte/index.tsx","utf8"),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
let initializer:ts.Expression|undefined;
function visit(node:ts.Node){if(ts.isVariableDeclaration(node)&&node.name.getText(source)==="handleImportGuestDraft") initializer=node.initializer;ts.forEachChild(node,visit);}
visit(source);
if(!initializer) throw new Error("Import click handler not found");
const js=ts.transpileModule("globalThis.runImport="+initializer.getText(source),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
function harness(){
 const env={guestImportInFlight:{current:false},setGuestImporting:vi.fn(),setError:vi.fn(),setGuestDraft:vi.fn(),
  loadGuestDraft:vi.fn().mockResolvedValue({id:"local"}),saveGuestCanvasToAccount:vi.fn().mockResolvedValue("saved"),
  invalidateEditorListCache:vi.fn(),window:{sessionStorage:{}},userId:"user",GTE_GUEST_EDITOR_ID:"local",
  gteApi:{deleteEditor:vi.fn().mockResolvedValue({ok:true})},isCurrentGuestImportDraft:vi.fn().mockReturnValue(true),clearImportedGuestDraft:vi.fn().mockReturnValue(true),router:{push:vi.fn().mockResolvedValue(true)}};
 const context=vm.createContext(env);vm.runInContext(js,context);
 return {...env,run:(context as any).runImport as ()=>Promise<void>};
}
describe("actual library draft-import click handler",()=>{
 it("ignores a double click even while the first draft read is still pending",async()=>{
  const h=harness();let resolve!: (value:unknown)=>void;
  h.loadGuestDraft.mockImplementation(()=>new Promise(done=>{resolve=done;}));
  const first=h.run(),second=h.run();expect(h.loadGuestDraft).toHaveBeenCalledOnce();
  resolve({id:"local"});await Promise.all([first,second]);
  expect(h.saveGuestCanvasToAccount).toHaveBeenCalledOnce();expect(h.router.push).toHaveBeenCalledWith("/gte/saved");
  expect(h.guestImportInFlight.current).toBe(false);
 });
 it.each(["loadGuestDraft","saveGuestCanvasToAccount"] as const)("does not delete or clear the draft when %s fails",async step=>{
  const h=harness();h[step].mockRejectedValueOnce(new Error("Cannot save"));
  await h.run();expect(h.gteApi.deleteEditor).not.toHaveBeenCalled();expect(h.clearImportedGuestDraft).not.toHaveBeenCalled();
  expect(h.router.push).not.toHaveBeenCalled();expect(h.setError).toHaveBeenLastCalledWith("Cannot save");
  expect(h.setGuestImporting).toHaveBeenLastCalledWith(false);expect(h.guestImportInFlight.current).toBe(false);
 });
 it("leaves a new draft alone if another tab edits during the save",async()=>{
  const h=harness();h.isCurrentGuestImportDraft.mockReturnValue(false);await h.run();
  expect(h.gteApi.deleteEditor).not.toHaveBeenCalled();expect(h.clearImportedGuestDraft).not.toHaveBeenCalled();
  expect(h.router.push).toHaveBeenCalledWith("/gte/saved");
 });
 it("leaves a new browser draft visible if it changes while server cleanup is pending",async()=>{
  const h=harness();h.clearImportedGuestDraft.mockReturnValue(false);await h.run();
  expect(h.setGuestDraft).not.toHaveBeenCalledWith(null);expect(h.router.push).toHaveBeenCalledWith("/gte/saved");
 });
});
