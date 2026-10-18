import {beforeEach,describe,it,expect,vi} from "vitest";
const capture=vi.hoisted(()=>vi.fn());
vi.mock("../../lib/posthogServer",()=>({createPostHogServerClient:()=>({captureExceptionImmediate:capture})}));
const customers=vi.hoisted(()=>({create:vi.fn(),update:vi.fn(),list:vi.fn()}));
vi.mock("../../lib/stripe",()=>({stripeClient:{customers}}));
import {setStripeEmailLanguage,syncStripeEmailLanguage} from "../../lib/i18n/stripeEmailLanguage";
describe("Stripe email preferences",()=>{
 beforeEach(()=>{vi.resetAllMocks();customers.update.mockImplementation(async (_id,params)=>({preferred_locales:params.preferred_locales}));});

 it("updates every matched billing customer while skipping already correct preferences",async()=>{
  customers.list.mockReturnValue((async function*(){yield {id:"first",preferred_locales:["en"]};yield {id:"second",preferred_locales:["fr"]};yield {id:"third",preferred_locales:[]};})());
  await syncStripeEmailLanguage("owner@example.com","fr");
  expect(customers.list).toHaveBeenCalledWith({email:"owner@example.com",limit:100});
  expect(customers.update.mock.calls).toEqual([["first",{preferred_locales:["fr"]}],["third",{preferred_locales:["fr"]}]]);
 });
 it("alerts when Stripe accepts an update but returns the wrong language",async()=>{
  customers.update.mockResolvedValue({preferred_locales:["en"]});
  await expect(setStripeEmailLanguage("customer","fr")).rejects.toThrow("Stripe email language preference could not be confirmed");
  expect(capture).toHaveBeenCalledWith(expect.any(Error),"system:stripe-email-language",expect.objectContaining({alert_eligible:true,expected_locale:"fr",delivery_stage:"stripe_preference_update_failed"}));
 });
 it("uses Stripe's language codes",async()=>{await setStripeEmailLanguage("customer","zh-Hans");expect(customers.update).toHaveBeenCalledWith("customer",{preferred_locales:["zh-CN"]});});
});
