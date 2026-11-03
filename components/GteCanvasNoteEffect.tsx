import type { MouseEvent } from "react";

/** Keep the connector under notes and its label in the foreground at the same height. */
export default function GteCanvasNoteEffect({left,top,width,height,label,title,selected,showLabel,onSelect}: {
  left:number; top:number; width:number; height:number; label:string; title:string;
  selected:boolean; showLabel:boolean; onSelect:(event:MouseEvent<HTMLButtonElement>)=>void;
}) {
  return <>
    <button type="button" tabIndex={-1} onMouseDown={onSelect} title={title}
      data-canvas-effect-connector="true"
      className={`absolute z-[1] ${selected ? "bg-[#8AECC8] shadow-sm" : "bg-[#34D399]"}`}
      style={{left,top,width,height,borderRadius:0}} />
    {showLabel && <button type="button" onMouseDown={onSelect} title={title} aria-label={title}
      data-canvas-effect-label="true" aria-pressed={selected}
      className={`absolute z-20 flex h-4 min-w-4 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-sm px-0.5 text-[11px] font-bold leading-none text-slate-900 ${selected ? "bg-emerald-100" : "hover:bg-emerald-50"}`}
      style={{left:left+width/2,top:top+height/2}}>{label}</button>}
  </>;
}
