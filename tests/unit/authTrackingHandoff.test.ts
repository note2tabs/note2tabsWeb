import {afterEach,describe,it,expect,vi} from "vitest";
const signIn=vi.hoisted(()=>vi.fn());vi.mock("next-auth/react",()=>({signIn}));
import {localizedSignIn} from "../../lib/i18n/auth";
describe("authentication handoff preserves measured checkout intent",()=>{
 afterEach(()=>{vi.unstubAllGlobals();signIn.mockClear();});
 it("preserves English checkout parameters rather than dropping NextAuth callbackUrl",async()=>{
  const assign=vi.fn();vi.stubGlobal("window",{location:{pathname:"/pricing",assign}});vi.stubGlobal("document",{cookie:""});
  const target="/pricing?funnel_id=checkout_123&checkout=1&billing=yearly";
  await localizedSignIn(undefined,{callbackUrl:target});
  const result=new URL(assign.mock.calls[0][0],"https://note2tabs.com");expect(result.pathname).toBe("/auth/login");expect(result.searchParams.get("next")).toBe(target);expect(signIn).not.toHaveBeenCalled();
 });
 it("continues to use NextAuth for explicit providers",async()=>{
  vi.stubGlobal("window",{location:{pathname:"/auth/login"}});vi.stubGlobal("document",{cookie:""});
  await localizedSignIn("google",{callbackUrl:"/pricing"});expect(signIn).toHaveBeenCalledWith("google",{callbackUrl:"/pricing"});
 });
});
