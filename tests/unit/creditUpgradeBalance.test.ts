import { afterEach, describe, expect, it, vi } from "vitest";
import { raiseBackendCreditsToFloor, withBackendRemainingCredits } from "../../lib/backendCredits";
describe("upgraded Pro balance remains above Premium cap", () => {
 afterEach(()=>vi.unstubAllGlobals());
 it("does not write a 200-credit cap over a 250-credit Pro allocation",async()=>{
  const fetch=vi.fn().mockResolvedValue({ok:true,json:async()=>({remainingCredits:250})});vi.stubGlobal('fetch',fetch);
  expect(await raiseBackendCreditsToFloor('user',250,{},500)).toBe(250);
  expect(fetch).toHaveBeenCalledTimes(1);
 });
 it("sends all 500 Pro rollover credits when syncing a grant",async()=>{
  const fetch=vi.fn().mockResolvedValueOnce({ok:true,json:async()=>({remainingCredits:250})}).mockResolvedValueOnce({ok:true,json:async()=>({remainingCredits:500})});vi.stubGlobal('fetch',fetch);
  expect(await raiseBackendCreditsToFloor('user',500,{},500)).toBe(500);
  expect(JSON.parse(fetch.mock.calls[1][1].body).credits).toBe(500);
 });
 it("retains Pro's 250 credits when rendering a backend balance",()=>{
  const summary={used:0,remaining:250,limit:250,resetAt:'',unlimited:false};
  expect(withBackendRemainingCredits(summary,250,500).remaining).toBe(250);
  expect(withBackendRemainingCredits(summary,230,500).remaining).toBe(230);
 });
});
