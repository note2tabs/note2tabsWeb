import { afterEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import proxy from "../../proxy";
afterEach(()=>vi.restoreAllMocks());
it("assigns a trusted correlation ID and logs only a templated endpoint",async()=>{
 const log=vi.spyOn(console,"info").mockImplementation(()=>{});
 const response=await proxy(new NextRequest("https://note2tabs.com/api/gte/editors/private-id?token=secret",{headers:{"x-request-id":"untrusted"}}));
 const id=response.headers.get("x-request-id");expect(id).toMatch(/^[a-f0-9-]{36}$/);
 expect(response.headers.get("x-middleware-request-x-request-id")).toBe(id);
 expect(log).toHaveBeenCalledWith("note2tabs.api_request",{request_id:id,endpoint:"/api/gte/editors/[id]",method:"GET"});
 expect(JSON.stringify(log.mock.calls)).not.toMatch(/private-id|secret|untrusted/);
});
it("does not instrument the telemetry transport itself",async()=>{
 const log=vi.spyOn(console,"info").mockImplementation(()=>{});
 const response=await proxy(new NextRequest("https://note2tabs.com/api/analytics/ingest"));
 expect(response.headers.get("x-request-id")).toBeNull();expect(log).not.toHaveBeenCalled();
});
