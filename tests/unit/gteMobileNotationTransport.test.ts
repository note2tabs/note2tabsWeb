// @vitest-environment jsdom
import React,{act} from "react";
import {createRoot,type Root} from "react-dom/client";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
vi.mock("../../lib/i18n/react",()=>({useLocale:()=>({t:(s:string)=>s})}));
import Transport from "../../components/GteMobileNotationTransport";
let root:Root,el:HTMLDivElement;
const toggle=vi.fn(),start=vi.fn();
beforeEach(()=>{vi.clearAllMocks();vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT",true);el=document.createElement("div");document.body.appendChild(el);root=createRoot(el);});
afterEach(async()=>{await act(async()=>root.unmount());el.remove();vi.unstubAllGlobals();});
async function render(extra:Partial<React.ComponentProps<typeof Transport>>={}){await act(async()=>root.render(React.createElement(Transport,{visible:true,playing:false,preparing:false,onToggle:toggle,onStart:start,...extra})));}
it("renders a song play button outside the scrollable score",async()=>{await render();const bar=document.querySelector('[data-gte-mobile-notation-transport]')!;expect(bar.parentElement).toBe(document.body);expect(bar.getAttribute("aria-label")).toBe("Playback controls");await act(async()=>bar.querySelector<HTMLButtonElement>('[aria-label="Play"]')!.click());expect(toggle).toHaveBeenCalledOnce();});
it("pauses the same playback engine when playing",async()=>{await render({playing:true});await act(async()=>document.querySelector<HTMLButtonElement>('[aria-label="Pause"]')!.click());expect(toggle).toHaveBeenCalledOnce();expect(document.querySelector('[aria-label="Play"]')).toBeNull();});
it("returns to the song start",async()=>{await render();await act(async()=>document.querySelector<HTMLButtonElement>('[aria-label="Go to start"]')!.click());expect(start).toHaveBeenCalledOnce();expect(toggle).not.toHaveBeenCalled();});
it("prevents duplicate starts while audio is preparing",async()=>{await render({preparing:true});const play=document.querySelector<HTMLButtonElement>('[aria-label="Play"]')!;expect(play.disabled).toBe(true);expect(play.getAttribute('aria-busy')).toBe('true');await act(async()=>play.click());expect(toggle).not.toHaveBeenCalled();await render({preparing:false});expect(document.querySelector<HTMLButtonElement>('[aria-label="Play"]')!.disabled).toBe(false);});
it("does not duplicate controls on desktop or other track types",async()=>{await render({visible:false});expect(document.querySelector('[data-gte-mobile-notation-transport]')).toBeNull();});
it("keeps one transport when switching reading modes or playback state",async()=>{await render();await render({playing:true});await render({playing:false});expect(document.querySelectorAll('[data-gte-mobile-notation-transport]')).toHaveLength(1);expect(document.querySelector('[aria-label="Play"]')).not.toBeNull();});
