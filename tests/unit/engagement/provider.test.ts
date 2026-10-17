// @vitest-environment jsdom
import React from "react";
import {act} from "react-dom/test-utils";
import {createRoot, type Root} from "react-dom/client";
import {EventEmitter} from "node:events";
import {beforeEach,afterEach,describe,it,expect,vi} from "vitest";
const m=vi.hoisted(()=>({arm:"contextual",fetch:vi.fn(),track:vi.fn().mockResolvedValue(undefined),claim:null as any,allow:false,observed:null as any,events:null as any}));
vi.mock("next-auth/react",()=>({useSession:()=>({data:{user:{id:"test-account"}},status:"authenticated"})}));
vi.mock("../../../lib/i18n/react",()=>({useLocaleRouter:()=>({asPath:window.location.pathname,events:m.events})}));
vi.mock("../../../lib/analyticsV2",()=>({track:m.track,flush:async()=>{}}));
vi.mock("../../../lib/gteTelemetryClient",()=>({flushGteTelemetry:async()=>{}}));
vi.mock("../../../components/PremiumUpgradePrompt",()=>({PremiumPromptCard:({onDismiss,visibilityRef}:any)=>React.createElement("aside",{ref:visibilityRef,"aria-label":"Premium test prompt"},React.createElement("button",{onClick:onDismiss},"Dismiss"))}));
import Provider from "../../../components/EngagementExperimentProvider";
import {useEngagementExperiment,ENGAGEMENT_PLAYBACK_EVENT,ENGAGEMENT_PLAYBACK_ACTIVE_EVENT} from "../../../lib/engagement/react";
function Child(){const c=useEngagementExperiment();m.claim=c.claimLegacy;m.allow=c.allowLegacy;return React.createElement("button",null,"Editor remains usable");}
describe("experiment browser lifecycle and single timing",()=>{
 let root:Root,container:HTMLDivElement;
 beforeEach(()=>{
  vi.useFakeTimers();vi.stubEnv("NEXT_PUBLIC_ENGAGEMENT_EXPERIMENT_ENABLED","true");m.arm="contextual";m.events=new EventEmitter();m.track.mockClear();
  Object.defineProperty(document,"visibilityState",{configurable:true,value:"visible"});window.history.replaceState({},"","/gte/test");
  m.fetch.mockReset().mockImplementation(async(_url:any,options:any)=>{const body=JSON.parse(options.body);return {ok:true,json:async()=>body.operation==="claim"?{mode:"active",arm:m.arm,show:true,contactId:"contact-test"}:{mode:"active",arm:m.arm}};});
  vi.stubGlobal("fetch",m.fetch);vi.stubGlobal("IntersectionObserver",class{constructor(private cb:any){}observe(element:any){m.observed=element;this.cb([{isIntersecting:true,intersectionRatio:1}]);}disconnect(){}});
  container=document.createElement("div");document.body.append(container);root=createRoot(container);
 });
 afterEach(async()=>{await act(async()=>root.unmount());container.remove();vi.useRealTimers();vi.unstubAllGlobals();vi.unstubAllEnvs();});
 const mount=async(arm="contextual")=>{m.arm=arm;await act(async()=>{root.render(React.createElement(Provider,null,React.createElement(Child)));});};
 const pause=async()=>act(async()=>{window.dispatchEvent(new CustomEvent(ENGAGEMENT_PLAYBACK_EVENT,{detail:{editorId:"test"}}));});
 const advance=async(ms=1200)=>act(async()=>{await vi.advanceTimersByTimeAsync(ms);});
 const claims=()=>m.fetch.mock.calls.filter(([,o])=>JSON.parse(o.body).operation==="claim");
 it("shows contextual only after 1200ms, records visibility, and dismisses",async()=>{
  await mount();expect(m.allow).toBe(false);await pause();await advance(1199);expect(claims()).toHaveLength(0);await advance(1);expect(claims()).toHaveLength(1);expect(container.textContent).toContain("Dismiss");expect(m.observed).toBe(container.querySelector("aside"));
  expect(m.fetch.mock.calls.some(([,o])=>JSON.parse(o.body).operation==="visible")).toBe(true);
  await act(async()=>container.querySelector('aside button')?.dispatchEvent(new MouseEvent('click',{bubbles:true})));expect(container.querySelector('aside')).toBeNull();expect(m.track).toHaveBeenCalledWith("premium_prompt_dismissed",expect.anything());
 });
 it.each(["control","existing"])("does not schedule contextual prompts in %s",async arm=>{await mount(arm);await pause();await advance();expect(claims()).toHaveLength(0);expect(container.querySelector('aside')).toBeNull();expect(m.allow).toBe(arm==="existing");});
 it("keeps the existing arm on legacy checkpoints and suppresses control claims",async()=>{
  await mount("existing");let ticket:any;await act(async()=>{ticket=await m.claim();});expect(ticket.contactId).toBe("contact-test");expect(JSON.parse(claims()[0][1].body).checkpoint).toBe("legacy");
 });
 it.each(["pointerdown","keydown",ENGAGEMENT_PLAYBACK_ACTIVE_EVENT])("cancels pending promotion on %s",async type=>{await mount();await pause();await act(async()=>{window.dispatchEvent(new Event(type));});await advance();expect(claims()).toHaveLength(0);});
 it("cancels navigation before reserving an opportunity",async()=>{await mount();await pause();await act(async()=>{m.events.emit("routeChangeStart","/pricing");});await advance();expect(claims()).toHaveLength(0);});
 it("does not show a prompt while hidden or editing",async()=>{
  await mount();await pause();Object.defineProperty(document,"visibilityState",{configurable:true,value:"hidden"});await advance();expect(claims()).toHaveLength(0);
  Object.defineProperty(document,"visibilityState",{configurable:true,value:"visible"});const input=document.createElement("input");container.append(input);input.focus();await pause();await advance();expect(claims()).toHaveLength(0);input.remove();
 });
 it("fails closed on a claim failure without breaking the editor",async()=>{await mount();m.fetch.mockRejectedValueOnce(new Error("offline"));await pause();await advance();expect(container.querySelector('aside')).toBeNull();expect(container.textContent).toContain("Editor remains usable");});
 it("cancels a claimed opportunity if activity occurs while the response is pending",async()=>{
  await mount();let resolve:any;m.fetch.mockImplementationOnce(()=>new Promise(r=>{resolve=r;}));await pause();await advance();expect(claims()).toHaveLength(1);
  await act(async()=>{window.dispatchEvent(new Event("keydown"));resolve({ok:true,json:async()=>({show:true,contactId:"late"})});});expect(container.querySelector('aside')).toBeNull();expect(m.fetch.mock.calls.some(([,o])=>JSON.parse(o.body).operation==="cancelled")).toBe(true);
 });
});
