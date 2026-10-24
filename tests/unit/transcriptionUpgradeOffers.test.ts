// @vitest-environment jsdom
import React, {act} from "react";
import {createRoot, type Root} from "react-dom/client";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
import {getDefaultFileClipRange} from "../../lib/transcriptionClip";
const m=vi.hoisted(()=>({send:vi.fn(),locale:"en",observe:null as null|((entries:any[])=>void)}));
vi.mock("../../lib/analytics",()=>({ANALYTICS_EVENTS:{premiumPromptEligible:"eligible",premiumPromptRendered:"rendered",premiumPromptShown:"shown",premiumPromptViewed:"viewed",premiumPromptClicked:"clicked"},sendEvent:m.send,trackCtaClick:vi.fn()}));
vi.mock("../../lib/i18n/react",()=>({useLocale:()=>({locale:m.locale,t:(s:string,p:Record<string,unknown>={})=>s.replace(/\{(\w+)\}/g,(_,k)=>String(p[k]??"")),href:(s:string)=>m.locale==="en"?s:`/${m.locale}${s}`})}));
vi.mock("../../components/LocaleLink",()=>({default:({href,...props}:any)=>React.createElement("a", {...props,href:m.locale==="en"?href:`/${m.locale}${href}`})}));
vi.mock("next-auth/react",()=>({useSession:()=>({data:null,status:"unauthenticated"})}));
import Offers from "../../components/TranscriptionUpgradeOffers";
let root:Root,el:HTMLDivElement;
const base={plan:"FREE" as const,mode:"FILE" as const,fileSelected:true,fileDuration:240,youtubeValid:false,signedIn:true,remaining:10,resetLabel:"1 November",suppressed:false};
async function render(props:Partial<React.ComponentProps<typeof Offers>>={}){await act(async()=>root.render(React.createElement(Offers,{...base,...props})));}
beforeEach(()=>{vi.clearAllMocks();m.locale="en";m.observe=null;sessionStorage.clear();vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT",true);vi.stubGlobal("IntersectionObserver",class{constructor(cb:any){m.observe=cb}observe(){}disconnect(){}});el=document.createElement("div");document.body.appendChild(el);root=createRoot(el);});
afterEach(async()=>{await act(async()=>root.unmount());el.remove();vi.unstubAllGlobals();});
it("restores the long-file offer even when the free selection is a valid 60-second clip",async()=>{
 expect(getDefaultFileClipRange(240,false)).toEqual({start:0,end:60});
 await render();expect(el.textContent).toContain("Transcribe more of this file");expect(el.querySelector("dialog")).toBeNull();
 expect(el.querySelector("a")?.href).toContain("reason=file_duration_limit");
});
it.each([null,0,30,60])("does not show a long-file offer for duration %s",async fileDuration=>{await render({fileDuration});expect(el.querySelector("aside")).toBeNull();});
it("does not offer a file that is no longer selected",async()=>{await render({fileSelected:false});expect(el.textContent).toBe("");});
it.each(["PREMIUM","PRO"] as const)("does not sell Premium to %s users",async plan=>{await render({plan});expect(el.textContent).toBe("");});
it("suppresses inline offers while a limit dialog, upload, or authentication handoff takes priority",async()=>{await render({suppressed:true});expect(el.textContent).toBe("");expect(m.send).not.toHaveBeenCalled();});
it.each([1,2,3])("restores one early low-credit offer at %s credits",async remaining=>{await render({remaining});expect(el.textContent).toContain("Keep transcribing today");expect(el.querySelectorAll("aside")).toHaveLength(1);expect(el.textContent).toContain("1 November");expect(el.querySelector("a")?.href).toContain("reason=credits_low");});
it("leaves exhausted credits to the blocking dialog",async()=>{await render({remaining:0});expect(el.textContent).toBe("");});
it("does not show low-credit messaging to signed-out users",async()=>{await render({signedIn:false,remaining:2,fileSelected:false});expect(el.textContent).toBe("");});
it("preserves the YouTube offer for a valid link and corrects the first-ten-minutes claim",async()=>{await render({mode:"YOUTUBE",youtubeValid:true});expect(el.textContent).toContain("Need a longer section?");expect(el.textContent).toContain("up to 10 minutes long");expect(el.textContent).not.toContain("first 10 minutes");expect(el.querySelector("a")?.href).toContain("reason=youtube_clip_limit");});
it("does not offer YouTube upgrades before a valid link is added",async()=>{await render({mode:"YOUTUBE",youtubeValid:false});expect(el.textContent).toBe("");});
it("does not show a YouTube offer behind a blocking dialog",async()=>{await render({mode:"YOUTUBE",youtubeValid:true,suppressed:true});expect(el.textContent).toBe("");});
it("shows only the credit offer when both credits and YouTube length are relevant",async()=>{await render({mode:"YOUTUBE",youtubeValid:true,remaining:2});expect(el.querySelectorAll("aside")).toHaveLength(1);expect(el.textContent).toContain("Keep transcribing today");});
it("counts visibility and clicks once with a distinct inline surface and version",async()=>{
 await render();expect(m.send.mock.calls.filter(([event])=>event==="shown")).toHaveLength(1);
 await act(async()=>m.observe?.([{isIntersecting:true,intersectionRatio:1}]));
 await act(async()=>m.observe?.([{isIntersecting:true,intersectionRatio:1}]));
 expect(m.send.mock.calls.filter(([event])=>event==="viewed")).toHaveLength(1);
 await render();expect(m.send.mock.calls.filter(([event])=>event==="shown")).toHaveLength(1);
 el.querySelector("a")!.addEventListener("click",e=>e.preventDefault());
 await act(async()=>el.querySelector("a")!.click());
 const clicks=m.send.mock.calls.filter(([event])=>event==="clicked");expect(clicks).toHaveLength(1);
 expect(clicks[0][1]).toMatchObject({surface:"file_duration_limit_card",offer_version:"inline_upgrade_v1",reason:"file_duration_limit"});
});
it("preserves localized pricing navigation",async()=>{m.locale="ja";await render();expect(el.querySelector("a")?.getAttribute("href")).toMatch(/^\/ja\/pricing\?/);});
