import {beforeEach,describe,expect,it,vi} from "vitest";
import {createMocks} from "node-mocks-http";
const m=vi.hoisted(()=>({session:vi.fn(),affiliate:vi.fn()}));
vi.mock("next-auth/next",()=>({getServerSession:m.session}));
vi.mock("../../pages/api/auth/[...nextauth]",()=>({authOptions:{}}));
vi.mock("../../lib/prisma",()=>({prisma:{affiliate:{findUnique:m.affiliate}}}));
vi.mock("../../lib/stripe",()=>({stripeClient:null}));
import handler from "../../pages/api/affiliate/me";
describe("affiliate dashboard data access",()=>{
 beforeEach(()=>vi.resetAllMocks());
 it("does not reveal data to a signed-out visitor",async()=>{
  m.session.mockResolvedValue(null);const {req,res}=createMocks({method:"GET"});await handler(req as any,res as any);
  expect(res._getStatusCode()).toBe(401);expect(m.affiliate).not.toHaveBeenCalled();
  expect(res.getHeader("Cache-Control")).toBe("private, no-store");
 });
 it("does not reveal data to an ordinary signed-in user",async()=>{
  m.session.mockResolvedValue({user:{id:"ordinary"}});m.affiliate.mockResolvedValue(null);
  const {req,res}=createMocks({method:"GET",query:{userId:"affiliate-user"}});await handler(req as any,res as any);
  expect(res._getStatusCode()).toBe(404);expect(res._getJSONData().affiliate).toBeUndefined();
  expect(m.affiliate).toHaveBeenCalledWith(expect.objectContaining({where:{userId:"ordinary"}}));
 });
 it("returns only the signed-in affiliate's dashboard",async()=>{
  m.session.mockResolvedValue({user:{id:"affiliate-user"}});m.affiliate.mockResolvedValue({code:"MYCODE",commissions:[],_count:{attributions:0}});
  const {req,res}=createMocks({method:"GET"});await handler(req as any,res as any);
  expect(res._getStatusCode()).toBe(200);expect(res._getJSONData().affiliate.code).toBe("MYCODE");
 });
});
