import { createMocks } from "node-mocks-http";
import { describe, expect, it } from "vitest";
import handler from "../../pages/api/gte-guest/[[...path]]";
import type { CanvasSnapshot } from "../../types/gte";
async function request(method: "GET" | "POST", path: string[], body?: Record<string, unknown>) {
  const {req,res}=createMocks({method,query:{path},body});req.cookies={note2tabs_gte_guest_session:"ukulele-pitch-regression"};
  await handler(req,res);expect(res.statusCode).toBe(200);return res._getJSONData();
}
describe("four-string guest note entry",()=>{
  it.each([
    ["ukulele-high-g",[69,64,60,67]], ["ukulele-low-g",[69,64,60,55]], ["bass-standard",[43,38,33,28]],
  ])("keeps %s pitches on note creation and reload",async(presetId,openStringMidi)=>{
    const canvas=await request("GET",["editors","local"]) as CanvasSnapshot;
    const lane={...canvas.editors[0], tuning:{presetId,openStringMidi,capo:0},notes:[],chords:[]};
    await request("POST",["editors","local","snapshot"],{snapshot:{...canvas,editors:[lane]}});
    for(let string=0;string<4;string++) {
      const added=await request("POST",["editors",`local__ed__${lane.id}`,"notes"],{time:string*120,tab:[string,0],length:120,snapToGrid:false});
      expect(added.snapshot.notes.at(-1).midiNum).toBe(openStringMidi[string]);
    }
    const reloaded=await request("GET",["editors","local"]);
    expect(reloaded.editors[0].notes.map((n:{midiNum:number})=>n.midiNum)).toEqual(openStringMidi);
  });
});
