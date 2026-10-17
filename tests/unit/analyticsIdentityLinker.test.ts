// @vitest-environment jsdom
import React from "react";
import {act} from "react-dom/test-utils";
import {createRoot, type Root} from "react-dom/client";
import {beforeEach,afterEach,describe,it,expect,vi} from "vitest";
const m=vi.hoisted(()=>({role:"FREE",send:vi.fn(),fetch:vi.fn()}));
vi.mock("next-auth/react",()=>({useSession:()=>({status:"authenticated",data:{user:{id:"account",role:m.role,createdAt:new Date().toISOString()}}})}));
vi.mock("../../lib/posthogClient",()=>({getPostHogIdentifiedUserId:()=>null,identifyPostHogUser:vi.fn(),isPostHogIdentityResetPending:()=>false,resetPostHogIdentity:async()=>{}}));
vi.mock("../../lib/analyticsV2",()=>({getAnalyticsOwnerId:()=>null,resetAnalyticsIdentity:async()=>{},getAnalyticsTrackingIds:()=>({anonId:"anon",sessionId:"session"})}));
vi.mock("../../lib/analytics",()=>({ANALYTICS_EVENTS:{signupCompleted:"signup_completed",tabShareEmailSignupCompleted:"tab_share_email_signup_completed",loginSucceeded:"login_succeeded"},sendEvent:m.send}));
import Component from "../../components/AnalyticsIdentityLinker";
import {saveOAuthIntent} from "../../lib/oauthAnalytics";
describe("identity link and OAuth completion lifecycle",()=>{
 let root:Root,host:HTMLDivElement;
 beforeEach(()=>{vi.useFakeTimers();vi.stubEnv("NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN","");m.role="FREE";m.send.mockClear();m.fetch.mockReset();vi.stubGlobal("fetch",m.fetch);
 const memory=()=>{const values=new Map<string,string>();return {get length(){return values.size},getItem:(k:string)=>values.get(k)||null,setItem:(k:string,v:string)=>values.set(k,v),removeItem:(k:string)=>values.delete(k),clear:()=>values.clear()}};
 Object.defineProperty(window,"localStorage",{configurable:true,value:memory()});Object.defineProperty(window,"sessionStorage",{configurable:true,value:memory()});host=document.createElement("div");document.body.append(host);root=createRoot(host);});
 afterEach(async()=>{await act(async()=>root?.unmount());host.remove();vi.useRealTimers();vi.unstubAllEnvs();vi.unstubAllGlobals();});
 it("does not lose OAuth completion when role changes during identity linking",async()=>{
  let resolve:any;m.fetch.mockImplementationOnce(()=>new Promise(r=>{resolve=r}));saveOAuthIntent("signup","/shared?source=tab_share_email");
  await act(async()=>root.render(React.createElement(Component)));m.role="PREMIUM";await act(async()=>root.render(React.createElement(Component)));
  await act(async()=>{resolve({ok:true});});
  expect(m.send.mock.calls.filter(c=>c[0]==="login_succeeded")).toHaveLength(1);
  expect(m.send).not.toHaveBeenCalledWith("signup_completed",expect.anything());
 });
 it("retries failed linking without persisting a false success or duplicating the login",async()=>{
  m.fetch.mockResolvedValueOnce({ok:false}).mockResolvedValue({ok:true});saveOAuthIntent("signup","/shared?source=tab_share_email");
  await act(async()=>root.render(React.createElement(Component)));expect(window.localStorage.length).toBe(0);
  await act(async()=>vi.advanceTimersByTimeAsync(10000));expect(m.fetch).toHaveBeenCalledTimes(2);
  expect(window.localStorage.getItem("note2tabs:analytics-identity-linked:account:anon")).toBe("1");
  expect(m.send.mock.calls.filter(c=>c[0]==="login_succeeded")).toHaveLength(1);
 });
});
