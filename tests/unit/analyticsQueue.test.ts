import {beforeEach,afterEach,describe,it,expect,vi} from "vitest";
import {createAnalyticsQueue} from "../../lib/analyticsQueue";
describe("queue delivery fault matrix",()=>{
 beforeEach(()=>vi.useFakeTimers());afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();});
 const make=(send:any,allowed=()=>true)=>createAnalyticsQueue<{id:string;ts:string;value?:string}>({key:"test-queue",batchSize:20,delay:10000,allowed,id:e=>e.id,timestamp:e=>e.ts,send});
 it("drains every page-exit batch without exceeding the UTF-8 keepalive budget",async()=>{
  const send=vi.fn().mockRejectedValue(new Error("offline"));const q=make(send);
  for(let i=0;i<45;i++)await q.enqueue({id:String(i),ts:new Date().toISOString(),value:"漢".repeat(600)});
  send.mockClear();send.mockResolvedValue(false);await q.flush("beacon");
  const ids=send.mock.calls.flatMap(([events])=>events.map((e:any)=>e.id));expect(new Set(ids).size).toBe(45);expect(ids).toHaveLength(45);
  for(const [events] of send.mock.calls)expect(new TextEncoder().encode(JSON.stringify({events})).byteLength).toBeLessThan(48000);
 });
 it("cannot resurrect a failed batch after opt-out followed by opt-in",async()=>{
  let reject:any;const send=vi.fn(()=>new Promise<boolean>((_r,j)=>reject=j));let allowed=true;const q=make(send,()=>allowed);
  await q.enqueue({id:"private-event",ts:new Date().toISOString()});const flight=q.flush();allowed=false;q.clear();allowed=true;reject(new Error("offline"));await flight;await q.flush();expect(send).toHaveBeenCalledTimes(1);
 });
});
