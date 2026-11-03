import { afterEach, describe, expect, it, vi } from "vitest";
import { raiseBackendCreditsToFloor, withBackendRemainingCredits } from "../../lib/backendCredits";
describe("upgraded Pro balance remains above Premium cap", () => {
 afterEach(()=>vi.unstubAllGlobals());
 it("does not write a 200-credit cap over a 500-credit Pro allocation",async()=>{
  const fetch=vi.fn().mockResolvedValue({ok:true,json:async()=>({remainingCredits:500})});vi.stubGlobal('fetch',fetch);
  expect(await raiseBackendCreditsToFloor('user',500,{},1000)).toBe(500);
  expect(fetch).toHaveBeenCalledTimes(1);
 });
 it("sends all 1000 Pro rollover credits when syncing a grant",async()=>{
  const fetch=vi.fn().mockResolvedValueOnce({ok:true,json:async()=>({remainingCredits:500})}).mockResolvedValueOnce({ok:true,json:async()=>({remainingCredits:1000})});vi.stubGlobal('fetch',fetch);
  expect(await raiseBackendCreditsToFloor('user',1000,{},1000)).toBe(1000);
  expect(JSON.parse(fetch.mock.calls[1][1].body).credits).toBe(1000);
 });
 it("keeps existing Pro balances unchanged until renewal",()=>{
  const summary={used:0,remaining:250,limit:250,resetAt:'',unlimited:false};
  expect(withBackendRemainingCredits(summary,250,1000).remaining).toBe(250);
  expect(withBackendRemainingCredits(summary,230,1000).remaining).toBe(230);
 });
});
