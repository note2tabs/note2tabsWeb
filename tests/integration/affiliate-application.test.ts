import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMocks } from "node-mocks-http";
const m=vi.hoisted(()=>({send:vi.fn()}));
vi.mock("../../lib/email",()=>({sendTransactionalEmail:m.send}));
import handler from "../../pages/api/affiliate/application";
const body=()=>({email:"creator@example.test",profile:"https://example.test/channel",audience:"",message:"I would share Note2Tabs in guitar lessons.",company:"",startedAt:Date.now()-5000});
let ip=0;
async function request(options:{method?:string;origin?:string;body?:any;ip?:string}={}){
 const {req,res}=createMocks({method:(options.method||"POST") as any,headers:{host:"www.note2tabs.com",origin:options.origin??"https://www.note2tabs.com","x-forwarded-for":options.ip||`192.0.2.${++ip}`},body:options.body||body()});
 await handler(req as any,res as any);return res;
}
describe("affiliate application email delivery",()=>{
 beforeEach(()=>{vi.clearAllMocks();m.send.mockResolvedValue(true);});
 it("sends an internal notification to the same inbox as internship applications",async()=>{
  const res=await request();expect(res._getStatusCode()).toBe(200);
  expect(m.send).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({to:"business@note2tabs.com",language:{kind:"internal"},subject:"Affiliate application — Note2Tabs",html:expect.stringContaining("creator@example.test"),text:expect.stringContaining("guitar lessons")}));
 });
 it("rejects other methods and cross-origin submissions before emailing",async()=>{
  expect((await request({method:"GET"}))._getStatusCode()).toBe(405);
  expect((await request({origin:"https://example.test"}))._getStatusCode()).toBe(400);
  expect(m.send).not.toHaveBeenCalled();
 });
 it("rejects invalid and honeypot submissions",async()=>{
  expect((await request({body:{...body(),email:"invalid"}}))._getStatusCode()).toBe(422);
  expect((await request({body:{...body(),company:"spam"}}))._getStatusCode()).toBe(400);
  expect(m.send).not.toHaveBeenCalled();
 });
 it("limits repeated attempts",async()=>{
  const ip="198.51.100.99";
  for(let i=0;i<4;i++)expect((await request({ip}))._getStatusCode()).toBe(200);
  expect((await request({ip}))._getStatusCode()).toBe(429);
  expect(m.send).toHaveBeenCalledTimes(4);
 });
 it.each([false,"throw"])("does not claim success when delivery fails (%s)",async failure=>{
  if(failure==="throw")m.send.mockRejectedValueOnce(new Error("SMTP unavailable"));else m.send.mockResolvedValueOnce(false);
  expect((await request())._getStatusCode()).toBe(503);
 });
});
