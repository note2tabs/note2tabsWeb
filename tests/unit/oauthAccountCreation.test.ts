import {beforeEach,afterEach,describe,it,expect,vi} from "vitest";
const m=vi.hoisted(()=>({options:null as any,signup:vi.fn().mockResolvedValue(undefined),share:vi.fn().mockResolvedValue(undefined)}));
vi.mock("next-auth",()=>({default:(_req:any,_res:any,options:any)=>{m.options=options;}}));
vi.mock("@next-auth/prisma-adapter",()=>({PrismaAdapter:()=>({})}));
vi.mock("../../lib/signupAnalytics",()=>({trackCreatedAccount:m.signup}));
vi.mock("../../lib/tabShareAnalyticsServer",()=>({trackTabShareEmailSignup:m.share}));
import handler from "../../pages/api/auth/[...nextauth]";
describe("OAuth account creation is the signup authority",()=>{
 beforeEach(()=>vi.clearAllMocks());afterEach(()=>vi.unstubAllEnvs());
 it("records creation independently of browser intent or loading the landing page",async()=>{
  const req={headers:{}} as any;handler(req,{} as any);const user={id:"new-account",createdAt:new Date("2026-10-17T10:00:00Z")};await m.options.events.createUser({user});expect(m.signup).toHaveBeenCalledWith(req,user,"google");
 });
 it("records shared-email attribution only when an account is actually created",async()=>{
  const req={headers:{cookie:`next-auth.callback-url=${encodeURIComponent("https://www.note2tabs.com/shared?source=tab_share_email")}`}} as any;handler(req,{} as any);await m.options.events.createUser({user:{id:"new-account",createdAt:new Date()}});expect(m.share).toHaveBeenCalledWith(expect.objectContaining({method:"google",returnTo:"/shared?source=tab_share_email",userId:"new-account"}));
 });
});
