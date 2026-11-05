import type {TabCoord} from "../types/gte";
export type FingeringDerivationCache = Map<number, {key:string; tabs:TabCoord[]}>;
/** Cache only derived coordinates; never retain or replace musical note data. */
export function memoNoteAlternates(cache:FingeringDerivationCache | undefined,id:number,key:string,derive:()=>TabCoord[]):TabCoord[] {
  const cached=cache?.get(id);
  const tabs=cached?.key===key ? cached.tabs : derive();
  if(cache && cached?.key!==key)cache.set(id,{key,tabs:tabs.map(tab=>[...tab] as TabCoord)});
  return tabs.map(tab=>[...tab] as TabCoord);
}
