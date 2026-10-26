import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import { expect, it, vi } from "vitest";
import type { EditorSnapshot } from "../../types/gte";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { createCanvas, loadImage, convertSVGTextToPath, GlobalFonts } from "@napi-rs/canvas";
vi.mock("../../lib/i18n/react", () => ({ useLocale: () => ({t:(value: string,params?:Record<string,unknown>) => value.replace(/\{(\w+)\}/g,(_,key) => String(params?.[key] ?? key))}) }));
import PracticeTab from "../../components/GtePracticeTab";

it("updates SVG playback without rerendering notes; follows systems, seeks, loops, and keeps bar/note controls",async () => {
  const dom = new JSDOM("<html><body><div class='gte-editor-sticky-banner'></div><div id='root'></div></body></html>",{pretendToBeVisual:true});
  vi.stubGlobal("window",dom.window); vi.stubGlobal("document",dom.window.document); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT",true);
  Object.defineProperty(dom.window,"innerHeight",{value:500,configurable:true});
  let width = 375, frame = 0, observer: (() => void) | undefined;
  vi.stubGlobal("ResizeObserver",class {constructor(callback:()=>void) {observer = callback;} observe() {} disconnect() {}});
  const tasks = new Map<number,FrameRequestCallback>(); let id = 0;
  vi.stubGlobal("requestAnimationFrame",(callback:FrameRequestCallback) => {tasks.set(++id,callback); return id;});
  vi.stubGlobal("cancelAnimationFrame",(key:number) => tasks.delete(key));
  dom.window.matchMedia = vi.fn().mockReturnValue({matches:false}); dom.window.scrollBy = vi.fn();
  vi.spyOn(dom.window.HTMLElement.prototype,"getBoundingClientRect").mockImplementation(function(this:HTMLElement) {
    return {width,height:200,top:this.classList.contains("gte-editor-sticky-banner") ? 0 : 200,bottom:this.classList.contains("gte-editor-sticky-banner") ? 100 : 400,left:0,right:width,x:0,y:0,toJSON:()=>({})};
  });
  const tick = () => {const next = [...tasks.values()]; tasks.clear(); next.forEach(callback => callback(0));};
  const source: EditorSnapshot = {id:"tab",framesPerMessure:480,totalFrames:1440,fps:240,notes:Array.from({length:24},(_,i) => ({id:i+1,startTime:i*60,length:60,midiNum:64,tab:[0,i%2 ? 14 : 12],optimals:[]})),chords:[],cutPositionsWithCoords:[],optimalsByTime:{}};
  const play = vi.fn(), select = vi.fn(), rangeSelect = vi.fn(); const root = createRoot(document.getElementById("root")!);
  const render = async (snapshot = source) => act(async () => root.render(React.createElement(PracticeTab,{snapshot,editorId:"tab",getFrame:()=>frame,playing:true,active:true,selectedBars:new Set<number>(),onBarSelect:select,onBarRangeSelect:rangeSelect,onPlayFrom:play})));
  try {
    await render();
    const first = document.querySelector('[data-practice-fret="n:1"]')!;
    expect(first.getAttribute("data-sounding")).toBe("true");
    frame = 60; tick();
    expect(first.getAttribute("data-sounding")).toBe("false");
    expect(document.querySelector('[data-practice-fret="n:2"]')?.getAttribute("data-sounding")).toBe("true");
    expect(document.querySelector('[data-practice-fret="n:1"]')).toBe(first);
    const svg = document.querySelector("svg")!, before = svg.lastElementChild!.getAttribute("transform");
    frame = 75; tick(); expect(svg.lastElementChild!.getAttribute("transform")).not.toBe(before);
    frame = 1200; tick(); expect(dom.window.scrollBy).toHaveBeenCalled();
    const scrollCount = vi.mocked(dom.window.scrollBy).mock.calls.length;
    frame = 1201; tick(); expect(vi.mocked(dom.window.scrollBy).mock.calls).toHaveLength(scrollCount);
    frame = 0; tick(); expect(first.getAttribute("data-sounding")).toBe("true");
    await act(async () => first.dispatchEvent(new dom.window.MouseEvent("click",{bubbles:true}))); expect(play).toHaveBeenCalledWith(0);
    await act(async () => (document.querySelector('[data-bar-index="0"]') as HTMLButtonElement).click()); expect(rangeSelect).toHaveBeenCalledWith(0,1,expect.anything());
    width = 1000; await act(async () => observer?.());
    expect(document.querySelector("svg")?.getAttribute("viewBox")).toContain("1000");
    expect(document.querySelectorAll("[data-practice-fret]")).toHaveLength(24);
    if (process.env.PRACTICE_TAB_PREVIEW_DIR) {
      GlobalFonts.registerFromPath("C:/Windows/Fonts/arial.ttf","Arial");
      for (const previewWidth of [375,1000]) {
        width = previewWidth; await act(async () => observer?.());
        const element = document.querySelector("svg")!;
        let markup = element.outerHTML.replace('width="100%"',`xmlns="http://www.w3.org/2000/svg" width="${width}"`);
        const barLabels = [...document.querySelectorAll<HTMLButtonElement>("[data-bar-index]")].map(button => `<text x="${parseFloat(button.style.left)+6}" y="${parseFloat(button.style.top)+16}" font-size="11" fill="#65766b">${button.textContent}</text>`).join("");
        markup = markup.replace("</svg>",barLabels+"</svg>").replace("font-family:inherit","font-family:Arial").replaceAll("<text ",'<text font-family="Arial" ');
        const canvas = createCanvas(width,Number(element.getAttribute("height"))), context = canvas.getContext("2d");
        context.fillStyle = "#fffefa"; context.fillRect(0,0,canvas.width,canvas.height);
        context.drawImage(await loadImage(convertSVGTextToPath(markup.replace(/<text\b[^>]*>[\s\S]*?<\/text>/g,""))),0,0);
        // Native SVG rasterizers on Windows can omit inherited-font text.
        // Paint the actual DOM text coordinates with the same size/anchor.
        for (const text of element.querySelectorAll("text")) {
          context.font = `${text.getAttribute("font-size") || 16}px Arial`;
          context.fillStyle = text.getAttribute("fill") || "#243a32";
          context.textAlign = text.getAttribute("text-anchor") === "middle" ? "center" : text.getAttribute("text-anchor") === "end" ? "right" : "left";
          context.textBaseline = text.hasAttribute("dominant-baseline") ? "middle" : "alphabetic";
          context.fillText(text.textContent || "",Number(text.getAttribute("x")),Number(text.getAttribute("y")));
        }
        for (const button of document.querySelectorAll<HTMLButtonElement>("[data-bar-index]")) {
          context.font = "11px Arial"; context.textAlign = "left"; context.textBaseline = "alphabetic"; context.fillStyle = "#65766b";
          context.fillText(button.textContent || "",parseFloat(button.style.left)+6,parseFloat(button.style.top)+16);
        }
        writeFileSync(join(process.env.PRACTICE_TAB_PREVIEW_DIR,`practice-tab-${width}.png`),canvas.toBuffer("image/png"));
      }
    }
    await render({...source,id:"next",totalFrames:480*7,notes:[{...source.notes[0],startTime:480*5}]});
    expect(document.querySelectorAll("[data-practice-fret]")).toHaveLength(1);
    expect(document.querySelector('[data-practice-fret="n:1"]')?.getAttribute("data-sounding")).toBe("false");
    const collapsed = document.querySelector<HTMLButtonElement>('[data-bar-index="0"]')!;
    expect(collapsed.textContent).toBe("5 empty bars");
    expect(collapsed.getAttribute("aria-label")).toContain("5 empty bars (1–5)");
    await act(async () => collapsed.click()); expect(rangeSelect).toHaveBeenLastCalledWith(0,5,expect.anything());
    expect(tasks.size).toBe(1);
  } finally {await act(async () => root.unmount()); expect(tasks.size).toBe(0); dom.window.close(); vi.unstubAllGlobals(); vi.restoreAllMocks();}
});
