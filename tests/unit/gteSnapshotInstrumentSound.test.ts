import {describe,it,expect} from "vitest";
import {snapshotInstrumentSound} from "../../lib/gteSnapshotInstrumentSound";
import {snapshotPreferencesChanged} from "../../lib/gteSnapshotPayload";
describe("sound identity across transport snapshots",()=>{
 it.each([["guitar-tab","acoustic","jazz"],["notation","gm:piano","grand_piano"]])("reads the selected %s sound from compatibility metadata",(type,transport,sound)=>{
  const lane={id:"lane",notes:[],instrumentType:type,instrumentId:transport,chordEditor:{instrumentType:type,instrumentSound:sound}};
  expect(snapshotInstrumentSound(lane)).toBe(sound);
  expect(snapshotPreferencesChanged({...lane,notes:[1]},lane,["instrumentId"])).toBe(false);
  expect(snapshotPreferencesChanged({...lane,chordEditor:{...lane.chordEditor,instrumentSound:"electric"}},lane,["instrumentId"])).toBe(true);
 });
 it("keeps an explicit non-transport sound ahead of stale metadata",()=>{
  expect(snapshotInstrumentSound({instrumentType:"guitar-tab",instrumentId:"electric",chordEditor:{instrumentSound:"jazz"}})).toBe("electric");
  expect(snapshotInstrumentSound({instrumentType:"bass-tab",instrumentId:"acoustic",chordEditor:{instrumentSound:"jazz"}})).toBe("acoustic");
  expect(snapshotInstrumentSound({instrumentId:"acoustic",chordEditor:{instrumentSound:"jazz"}})).toBe("acoustic");
 });
});
