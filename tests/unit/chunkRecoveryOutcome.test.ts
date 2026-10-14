import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { rememberChunkRecovery, reportChunkRecoveryOutcome, forgetChunkRecoveryOutcome } from "../../lib/chunkRecoveryOutcome";
import { setErrorBreadcrumbsEnabled } from "../../lib/errorBreadcrumbs";
let storage: Map<string,string>;
beforeEach(()=>{
 vi.useFakeTimers(); vi.setSystemTime(100_000); storage=new Map(); setErrorBreadcrumbsEnabled(true);
 vi.stubGlobal("window", {location:{pathname:"/blog/article",origin:"https://note2tabs.com"},sessionStorage:{getItem:(k:string)=>storage.get(k)??null,setItem:(k:string,v:string)=>storage.set(k,v),removeItem:(k:string)=>storage.delete(k)},setTimeout,clearTimeout,addEventListener:vi.fn(),removeEventListener:vi.fn(),performance:{getEntriesByType:()=>[{name:"https://note2tabs.com/_next/static/chunks/fail.js",encodedBodySize:50}]}});
});
afterEach(()=>{setErrorBreadcrumbsEnabled(false);vi.useRealTimers();vi.unstubAllGlobals();});
it("correlates a reload with a mounted page and successfully loaded asset",()=>{
 const id=rememberChunkRecovery(new Error("Failed to load chunk /_next/static/chunks/fail.js?secret=token"));
 expect(JSON.stringify([...storage])).not.toContain("secret"); const report=vi.fn(); reportChunkRecoveryOutcome(report);vi.advanceTimersByTime(2000);
 expect(report).toHaveBeenCalledWith(expect.objectContaining({recovery_attempt_id:id,recovery_outcome:"page_mounted_assets_loaded",recovery_assets_loaded:true})); expect(storage.size).toBe(0);
});
it("does not claim success for an unverified asset or a different route",()=>{
 rememberChunkRecovery(new Error("Loading chunk unknown failed"));const report=vi.fn();reportChunkRecoveryOutcome(report);vi.advanceTimersByTime(2000);
 expect(report).toHaveBeenLastCalledWith(expect.objectContaining({recovery_outcome:"page_mounted_unverified_assets"}));
 rememberChunkRecovery(new Error("chunkloaderror"),"/another-page");reportChunkRecoveryOutcome(report);vi.advanceTimersByTime(2000);
 expect(report).toHaveBeenLastCalledWith(expect.objectContaining({recovery_outcome:"different_page_mounted"}));
});
it("reports a page error instead of successful recovery and expires old attempts",()=>{
 rememberChunkRecovery(new Error("chunkloaderror"));const report=vi.fn();reportChunkRecoveryOutcome(report);
 const calls=vi.mocked(window.addEventListener).mock.calls; (calls.find(c=>c[0]==="error")![1] as EventListener)(new Event("error"));vi.advanceTimersByTime(2000);
 expect(report).toHaveBeenCalledWith(expect.objectContaining({recovery_outcome:"page_error_after_reload"}));
 report.mockClear();rememberChunkRecovery(new Error("chunkloaderror"));vi.advanceTimersByTime(300_001);reportChunkRecoveryOutcome(report);vi.advanceTimersByTime(2000);expect(report).not.toHaveBeenCalled();
});
it("respects opt-out, cleans listeners, and never changes the reload guard",()=>{
 rememberChunkRecovery(new Error("chunkloaderror"));const report=vi.fn();const stop=reportChunkRecoveryOutcome(report);stop();vi.advanceTimersByTime(2000);expect(report).not.toHaveBeenCalled();
 setErrorBreadcrumbsEnabled(false);forgetChunkRecoveryOutcome();expect(rememberChunkRecovery(new Error("chunkloaderror"))).toBeUndefined();expect(storage.size).toBe(0);
});
