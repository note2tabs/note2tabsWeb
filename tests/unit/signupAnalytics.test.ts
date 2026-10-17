import {beforeEach,afterEach,describe,it,expect,vi} from "vitest";
const m=vi.hoisted(()=>({capture:vi.fn(),flush:vi.fn().mockResolvedValue(undefined),record:vi.fn().mockResolvedValue(undefined)}));
vi.mock("../../lib/posthogServer",()=>({createPostHogServerClient:()=>({capture:m.capture,flush:m.flush})}));
vi.mock("../../lib/engagement/server",()=>({recordEngagementEvents:m.record}));
import {trackCreatedAccount} from "../../lib/signupAnalytics";
describe("authoritative account-created signup tracking",()=>{
 beforeEach(()=>vi.clearAllMocks());afterEach(()=>vi.unstubAllEnvs());
 it.each(["email","google"] as const)("records the true creation time and stable account key for %s",async method=>{
  const user={id:"account",createdAt:new Date("2026-10-17T12:00:00Z")};await trackCreatedAccount({headers:{}} as any,user,method);await trackCreatedAccount({headers:{}} as any,user,method);
  expect(m.capture.mock.calls[0][0]).toEqual(m.capture.mock.calls[1][0]);expect(m.capture).toHaveBeenCalledWith(expect.objectContaining({event:"signup_completed",timestamp:user.createdAt,properties:expect.objectContaining({$insert_id:"signup:account",method})}));
 });
 it("does not record an opted-out account",async()=>{await trackCreatedAccount({headers:{cookie:"analytics_consent=denied"}} as any,{id:"account",createdAt:new Date()},"email");expect(m.capture).not.toHaveBeenCalled();});
});
