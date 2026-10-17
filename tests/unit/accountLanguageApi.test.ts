import {beforeEach,describe,it,expect,vi} from "vitest";
import {createMocks} from "node-mocks-http";
const m=vi.hoisted(()=>({session:vi.fn(),read:vi.fn(),write:vi.fn(),user:vi.fn(),stripe:vi.fn()}));
vi.mock("next-auth/next",()=>({getServerSession:m.session}));
vi.mock("../../pages/api/auth/[...nextauth]",()=>({authOptions:{}}));
vi.mock("../../lib/i18n/accountLanguage",()=>({accountEmailLocale:m.read,saveAccountLanguage:m.write}));
vi.mock("../../lib/i18n/stripeEmailLanguage",()=>({syncStripeEmailLanguage:m.stripe}));
vi.mock("../../lib/prisma",()=>({prisma:{user:{findUnique:m.user}}}));
import handler from "../../pages/api/account/language";
describe("account language API",()=>{
 beforeEach(()=>{vi.resetAllMocks();m.session.mockResolvedValue({user:{id:"signed-in"}});m.read.mockResolvedValue("pl");m.write.mockResolvedValue(1);m.user.mockResolvedValue(null);});
 it("requires authentication",async()=>{m.session.mockResolvedValue(null);const{req,res}=createMocks({method:"POST",body:{locale:"pl"}});await handler(req as any,res as any);expect(res.statusCode).toBe(401);expect(m.write).not.toHaveBeenCalled();});
 it("only updates the signed-in account, validates locale and keeps initialization insert-only",async()=>{
  const{req,res}=createMocks({method:"POST",body:{locale:"pl",accountId:"someone-else",initialize:true}});await handler(req as any,res as any);
  expect(m.write).toHaveBeenCalledWith("signed-in","pl",true);expect(res._getJSONData()).toEqual({locale:"pl"});
  const invalid=createMocks({method:"POST",body:{locale:"not-a-language"}});await handler(invalid.req as any,invalid.res as any);expect(invalid.res.statusCode).toBe(400);
 });
 it("synchronizes native billing emails only for the verified account address",async()=>{
  m.user.mockResolvedValue({email:"owner@example.com",emailVerified:new Date(),emailVerifiedBool:true});
  const{req,res}=createMocks({method:"POST",body:{locale:"pl",email:"attacker@example.com"}});await handler(req as any,res as any);
  expect(m.stripe).toHaveBeenCalledWith("owner@example.com","pl");expect(res.statusCode).toBe(200);
 });
 it("does not hit Stripe again for unchanged preferences",async()=>{
  m.write.mockResolvedValue(0);const{req,res}=createMocks({method:"POST",body:{locale:"pl",initialize:true}});await handler(req as any,res as any);expect(m.user).not.toHaveBeenCalled();expect(m.stripe).not.toHaveBeenCalled();
 });
});
