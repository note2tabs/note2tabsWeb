import type { TranscriberTrack } from "./gteApi";
import { importedInstrument } from "./gteImportedInstrument";
let common: Promise<unknown> | undefined;
const requested=new Set<string>();
/** Overlap the editor download with inference; no audio/model requests. Only
 * preload the preferred initial renderer, avoiding downloads for unused views. */
export function preloadStreamingEditor(tracks: readonly TranscriberTrack[] = []) {
 common ??= Promise.all([import("../components/GteEditorWorkspace"),import("../components/GteTrackWorkspace")]).catch(()=>{common=undefined;});
 const kinds=tracks.map(track=>{const instrument=importedInstrument(track).instrumentType; return instrument === "drums" ? "drums" : instrument === "notation" ? "notation" : "tab";});
 const kind=kinds.includes("tab") ? "tab" : kinds.includes("notation") ? "notation" : kinds[0];
 if(kind && !requested.has(kind)) {
  requested.add(kind);
  const module=kind === "drums" ? import("../components/GteDrumWorkspace") : kind === "notation" ? import("../components/GteNotationWorkspace") : import("../components/GteWorkspace");
  void module.catch(()=>requested.delete(kind));
 }
 return common;
}
