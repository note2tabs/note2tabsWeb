// @vitest-environment jsdom
import React from "react";
import {act} from "react-dom/test-utils";
import {createRoot,type Root} from "react-dom/client";
import {beforeEach,afterEach,describe,it,expect,vi} from "vitest";
const m=vi.hoisted(()=>({status:"unauthenticated",userId:"user1",send:vi.fn(),fetch:vi.fn()}));
vi.mock("next-auth/react",()=>({useSession:()=>({status:m.status,data:m.status==="authenticated"?{user:{id:m.userId}}:null}),signIn:vi.fn()}));
vi.mock("../../lib/i18n/react",()=>({useLocale:()=>({locale:"en",t:(s:string)=>s})}));
vi.mock("../../lib/analytics",()=>({sendEvent:m.send}));
vi.mock("next/head",()=>({default:()=>null}));
import Page from "../../pages/affiliate";
const data={code:"SECRET_CODE",commissions:[],totals:{pending:0,paid:0},commissionMonths:6,discountMonths:6};
let root:Root,host:HTMLDivElement;
beforeEach(()=>{vi.resetAllMocks();m.status="unauthenticated";m.userId="user1";vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT",true);vi.stubGlobal("fetch",m.fetch);host=document.createElement("div");document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();});
const render=()=>act(async()=>root.render(React.createElement(React.StrictMode,null,React.createElement(Page))));
describe("authorized affiliate dashboard views",()=>{
 it("does not count a visitor to the public signed-out shell as dashboard access",async()=>{
  await render();expect(m.fetch).not.toHaveBeenCalled();expect(m.send).not.toHaveBeenCalled();expect(host.textContent).not.toContain("SECRET_CODE");
 });
 it("does not count a signed-in non-affiliate's rejected request",async()=>{
  m.status="authenticated";m.fetch.mockResolvedValue({ok:false,json:async()=>({error:"No affiliate account"})});await render();
  expect(m.send).not.toHaveBeenCalled();expect(host.textContent).not.toContain("SECRET_CODE");
 });
 it("counts an authorized view once, including React strict-mode replay",async()=>{
  m.status="authenticated";m.fetch.mockResolvedValue({ok:true,json:async()=>({affiliate:data})});await render();await render();
  expect(m.send).toHaveBeenCalledExactlyOnceWith("affiliate_dashboard_viewed",{surface:"affiliate_dashboard",access:"authorized"});
  expect(host.textContent).toContain("SECRET_CODE");
 });
 it("hides loaded data immediately when the session expires",async()=>{
  m.status="authenticated";m.fetch.mockResolvedValue({ok:true,json:async()=>({affiliate:data})});await render();m.status="unauthenticated";await render();
  expect(host.textContent).not.toContain("SECRET_CODE");expect(m.send).toHaveBeenCalledTimes(1);
 });
 it("does not show the previous affiliate's data to a different account",async()=>{
  m.status="authenticated";m.fetch.mockResolvedValue({ok:true,json:async()=>({affiliate:data})});await render();
  m.userId="user2";m.fetch.mockResolvedValue({ok:false,json:async()=>({error:"No affiliate account"})});await render();
  expect(host.textContent).not.toContain("SECRET_CODE");expect(m.send).toHaveBeenCalledTimes(1);
 });
});
