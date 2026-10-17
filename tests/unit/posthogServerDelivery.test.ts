import {beforeEach,afterEach,describe,it,expect,vi} from "vitest";
const m=vi.hoisted(()=>({enqueue:vi.fn().mockResolvedValue(undefined),flush:vi.fn().mockResolvedValue(undefined),identify:vi.fn(),alias:vi.fn()}));
vi.mock("../../lib/posthogOutbox",()=>({enqueuePostHogCaptures:m.enqueue,retryPostHogCaptures:vi.fn()}));
vi.mock("posthog-node",()=>({PostHog:class{flush=m.flush;identify=m.identify;alias=m.alias;getFeatureFlag(){return "control";}}}));
import {createPostHogServerClient} from "../../lib/posthogServer";
describe("durable server capture facade",()=>{
 beforeEach(()=>{vi.clearAllMocks();vi.stubEnv("POSTHOG_PROJECT_TOKEN",crypto.randomUUID());vi.stubEnv("VERCEL_ENV","production");});afterEach(()=>vi.unstubAllEnvs());
 it("converts explicit insert keys into stable UUIDs before durable enqueue",async()=>{
  const client=createPostHogServerClient()!;const timestamp=new Date("2026-10-17T00:00:00Z");
  for(let i=0;i<2;i++){client.capture({distinctId:"account",event:"affiliate_payment_succeeded",timestamp,properties:{$insert_id:"payment:invoice"}});await client.flush();}
  const first=m.enqueue.mock.calls[0][0][0],second=m.enqueue.mock.calls[1][0][0];expect(first).toEqual(second);expect(first.uuid).toMatch(/^[a-f0-9-]{36}$/);expect(first.timestamp).toBe(timestamp.toISOString());expect(first.properties).toMatchObject({environment:"production",$geoip_disable:true});
 });
 it("leaves independent occurrences independent and keeps system events out of person profiles",async()=>{
  const client=createPostHogServerClient()!;client.capture({distinctId:"system:scheduler",event:"run"});client.capture({distinctId:"system:scheduler",event:"run"});await client.flush();
  const [first,second]=m.enqueue.mock.calls[0][0];expect(first.uuid).not.toBe(second.uuid);expect(first.properties.$process_person_profile).toBe(false);
 });
 it("delegates identity and flag SDK methods and waits for queue persistence before returning",async()=>{
  const client=createPostHogServerClient()!;client.identify({distinctId:"account"});client.alias({distinctId:"anon",alias:"account"});expect(await client.getFeatureFlag("flag","account")).toBe("control");await client.flush();expect(m.identify).toHaveBeenCalledOnce();expect(m.alias).toHaveBeenCalledOnce();expect(m.flush).toHaveBeenCalledOnce();
 });
});
