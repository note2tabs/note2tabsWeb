import {afterEach,beforeEach,expect,it,vi} from "vitest";
vi.mock("../../lib/prisma",()=>({prisma:{}}));
vi.mock("../../lib/transcriptionCompleteEmail",()=>({sendTranscriptionCompleteEmailOnce:vi.fn()}));
import {fetchBackendJob} from "../../lib/jobResultDelivery";
const headers={"X-User-Id":"user","If-None-Match":"etag"};
afterEach(()=>vi.unstubAllGlobals());
it("shares simultaneous identical reads, then fetches fresh progress",async()=>{
 let release!:(response:Response)=>void;
 const fetch=vi.fn(()=>new Promise<Response>(resolve=>{release=resolve;}));vi.stubGlobal("fetch",fetch);
 const a=fetchBackendJob("job",headers,false);const b=fetchBackendJob("job",headers,false);
 expect(fetch).toHaveBeenCalledTimes(1);release(new Response("running"));expect((await a).text).toBe("running");expect((await b).text).toBe("running");
 const c=fetchBackendJob("job",headers,false);expect(fetch).toHaveBeenCalledTimes(2);release(new Response("done"));expect((await c).text).toBe("done");
});
it("isolates users, jobs, ETags and full output reads",async()=>{
 const fetch=vi.fn(async()=>new Response("running"));vi.stubGlobal("fetch",fetch);
 await Promise.all([fetchBackendJob("job",headers,false),fetchBackendJob("job",{...headers,"X-User-Id":"other"},false),fetchBackendJob("other",headers,false),fetchBackendJob("job",{...headers,"If-None-Match":"other"},false),fetchBackendJob("job",headers,true),fetchBackendJob("job",headers,true)]);
 expect(fetch).toHaveBeenCalledTimes(6);
});
it("removes failed requests so the next poll retries",async()=>{
 const fetch=vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(new Response("running"));vi.stubGlobal("fetch",fetch);
 await expect(fetchBackendJob("retry",headers,false)).rejects.toThrow("offline");expect((await fetchBackendJob("retry",headers,false)).text).toBe("running");
});
