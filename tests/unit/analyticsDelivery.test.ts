import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../../lib/fingerprint", () => ({ generateFingerprint: async () => ({ fingerprintId: "fingerprint" }) }));
vi.mock("../../lib/acquisitionAttribution", () => ({ getAcquisitionProperties: () => ({}), ANALYTICS_ATTRIBUTION_COOKIE: "analytics_first_touch" }));

describe("browser analytics delivery", () => {
  beforeEach(() => {
    vi.resetModules(); vi.useFakeTimers(); vi.stubEnv("NODE_ENV", "production");
    vi.stubGlobal("document", { cookie: "analytics_consent=granted; analytics_anon=anon; analytics_session=session", referrer: "", addEventListener: vi.fn() });
    vi.stubGlobal("window", { location: { protocol: "https:", pathname: "/job/123" }, addEventListener: vi.fn() });
    vi.stubGlobal("navigator", { sendBeacon: vi.fn(() => false) });
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

  it("retries a failed HTTP batch with identical event IDs and timestamps", async () => {
    const fetch = vi.fn().mockResolvedValueOnce({ ok: false }).mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetch);
    const analytics = await import("../../lib/analyticsV2");
    await analytics.track("transcription_imported_to_editor", { job_id: "job", editor_id: "editor" });
    await analytics.flush();
    await analytics.flush();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[0][1].body).toBe(fetch.mock.calls[1][1].body);
  });

  it("falls back to keepalive fetch when the browser refuses a beacon", async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true }); vi.stubGlobal("fetch", fetch);
    const analytics = await import("../../lib/analyticsV2");
    await analytics.track("transcription_result_viewed", { job_id: "job" });
    await analytics.flush("pagehide");
    expect(fetch).toHaveBeenCalledWith("/api/analytics/ingest", expect.objectContaining({ keepalive: true }));
  });

  it("clears pending events when the user opts out", async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true }); vi.stubGlobal("fetch", fetch);
    const analytics = await import("../../lib/analyticsV2");
    await analytics.track("transcription_result_viewed");
    analytics.setAnalyticsConsent("denied");
    await analytics.flush();
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("analytics correctness under reloads and concurrency", () => {
  let session: Map<string,string>, local: Map<string,string>;
  beforeEach(() => {
    vi.resetModules(); vi.useFakeTimers(); vi.stubEnv("NODE_ENV", "production");
    session=new Map(); local=new Map();
    const storage=(map:Map<string,string>)=>({getItem:(k:string)=>map.get(k)||null,setItem:(k:string,v:string)=>map.set(k,v),removeItem:(k:string)=>map.delete(k)});
    vi.stubGlobal("window", {location:{protocol:"https:",pathname:"/pricing"},sessionStorage:storage(session),localStorage:storage(local),addEventListener:vi.fn()});
    const cookies=new Map([["analytics_anon","anon"],["analytics_session","session"]]);
    const doc={referrer:"",addEventListener:vi.fn()};
    Object.defineProperty(doc,"cookie",{get:()=>[...cookies].map(([k,v])=>`${k}=${v}`).join("; "),set:(value:string)=>{const [pair,...attrs]=value.split(";");const [key,val]=pair.split("=");if(attrs.some(x=>x.trim()==="Max-Age=0"))cookies.delete(key);else cookies.set(key,val);}});
    vi.stubGlobal("document",doc);
    vi.stubGlobal("navigator",{sendBeacon:vi.fn(()=>false)});
  });
  afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();vi.unstubAllEnvs();});
  it("preserves an unsent event across a page reload",async()=>{
    const request=vi.fn().mockResolvedValue({ok:true});vi.stubGlobal("fetch",request);
    const a=await import("../../lib/analyticsV2");await a.track("pricing_viewed");
    const original=JSON.parse(session.get("n2t:analytics-pending:v1")!)[0];
    vi.resetModules();const b=await import("../../lib/analyticsV2");await b.flush();
    expect(JSON.parse(request.mock.calls[0][1].body).events).toEqual([original]);expect(session.has("n2t:analytics-pending:v1")).toBe(false);
  });
  it("replays an accepted but unacknowledged beacon with identical identity",async()=>{
    vi.stubGlobal("navigator",{sendBeacon:vi.fn(()=>true)});
    const request=vi.fn().mockResolvedValue({ok:true});vi.stubGlobal("fetch",request);
    const a=await import("../../lib/analyticsV2");await a.track("pricing_viewed");await a.flush("pagehide");
    const pending=session.get("n2t:analytics-pending:v1");expect(pending).toBeTruthy();expect(request).not.toHaveBeenCalled();
    vi.resetModules();const b=await import("../../lib/analyticsV2");await b.flush();
    expect(JSON.parse(request.mock.calls[0][1].body).events).toEqual(JSON.parse(pending!));
  });
  it("honors explicit business keys across reloads, without merging ordinary clicks",async()=>{
    const request=vi.fn().mockResolvedValue({ok:true});vi.stubGlobal("fetch",request);
    let a=await import("../../lib/analyticsV2");await a.track("transcription_succeeded",{$insert_id:"completed:job"});await a.flush();
    vi.advanceTimersByTime(5000);vi.resetModules();a=await import("../../lib/analyticsV2");await a.track("transcription_succeeded",{$insert_id:"completed:job"});await a.flush();
    const first=JSON.parse(request.mock.calls[0][1].body).events[0],second=JSON.parse(request.mock.calls[1][1].body).events[0];
    expect(second.event_id).toBe(first.event_id);expect(second.ts).toBe(first.ts);
    await a.track("cta_clicked");await a.track("cta_clicked");await a.flush();
    const clicks=JSON.parse(request.mock.calls[2][1].body).events;expect(clicks).toHaveLength(2);expect(clicks[0].event_id).not.toBe(clicks[1].event_id);
  });
  it("does not resend a queued batch during a concurrent flush",async()=>{
    let resolve:any;const request=vi.fn(()=>new Promise(r=>{resolve=r}));vi.stubGlobal("fetch",request);
    const a=await import("../../lib/analyticsV2");await a.track("pricing_viewed");const first=a.flush();await a.flush();expect(request).toHaveBeenCalledTimes(1);resolve({ok:true});await first;
  });
  it("does not retry permanently invalid payloads forever",async()=>{
    const request=vi.fn().mockResolvedValue({ok:false,status:400});vi.stubGlobal("fetch",request);
    const a=await import("../../lib/analyticsV2");await a.track("pricing_viewed");await a.flush();await a.flush();expect(request).toHaveBeenCalledTimes(1);
  });
  it("does not restore an in-flight failed batch after consent withdrawal",async()=>{
    let reject:any;const request=vi.fn(()=>new Promise((_r,j)=>{reject=j}));vi.stubGlobal("fetch",request);
    const a=await import("../../lib/analyticsV2");await a.track("pricing_viewed");const first=a.flush();a.setAnalyticsConsent("denied");reject(new Error("offline"));await first;await a.flush();expect(request).toHaveBeenCalledTimes(1);expect(session.size).toBe(0);
  });
});
