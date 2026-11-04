import {beforeAll,afterAll,describe,it,expect,vi} from "vitest";
import {createRequire} from "node:module";
import type {EditorSnapshot} from "../../types/gte";
const state=vi.hoisted(()=>({db:null as any}));
vi.mock('../../lib/prisma',()=>({prisma:new Proxy({},{get:(_,key)=>state.db[key]})}));
import {persistTrackInstrumentsFromSnapshot,hydrateTrackInstrumentsFromStore} from '../../lib/gteTrackInstrumentStore';
import {persistTrackPlaybackFromSnapshot,hydrateTrackPlaybackFromStore} from '../../lib/gteTrackPlaybackStore';
import {persistDrumLoopsFromSnapshot,hydrateDrumLoopsFromStore} from '../../lib/gteDrumLoopStore';

// Optional disposable PostgreSQL WASM runtime; never uses DATABASE_URL or Neon.
const modulePath=process.env.N2T_PGLITE_MODULE;
describe.skipIf(!modulePath)('preference persistence with isolated PostgreSQL',()=>{
  let db:any;
  const lane:EditorSnapshot={id:'lane',notes:[],chords:[],framesPerMessure:480,fps:240,totalFrames:960,cutPositionsWithCoords:[],optimalsByTime:{},instrumentId:'jazz',playbackVolume:0.8,playbackMuted:false,playbackIsolated:true,drumLoops:[{id:'loop',sourceStart:0,sourceEnd:120,loopEnd:480}]};
  const save=async(value:unknown)=>{await persistTrackInstrumentsFromSnapshot('canvas__ed__lane',value);await persistTrackPlaybackFromSnapshot('user','canvas__ed__lane',value);await persistDrumLoopsFromSnapshot('canvas__ed__lane',value);};
  beforeAll(async()=>{
    const {PGlite}=createRequire(import.meta.url)(modulePath!);db=new PGlite();
    await db.exec(`CREATE TABLE "GteTrackInstrument" ("id" text,"editorId" text,"laneId" text,"instrumentId" text,"createdAt" timestamp,"updatedAt" timestamp,UNIQUE("editorId","laneId"));
      CREATE TABLE "GteTrackPlaybackSetting" ("id" text,"userId" text,"editorId" text,"laneId" text,"volume" double precision,"muted" boolean,"isolated" boolean,"createdAt" timestamp,"updatedAt" timestamp,UNIQUE("userId","editorId","laneId"));
      CREATE TABLE "GteDrumLoopState" ("id" text,"editorId" text,"laneId" text,"loops" jsonb,"createdAt" timestamp,"updatedAt" timestamp,UNIQUE("editorId","laneId"));`);
    state.db={$transaction:(fn:any)=>fn(state.db),$executeRaw:async(sql:any)=>(await db.query(sql.text,sql.values)).affectedRows,$queryRaw:async(sql:any)=>(await db.query(sql.text,sql.values)).rows};
  });
  afterAll(async()=>{await db?.close();});
  it('retains identical values without updating rows, then persists real changes and hydrates canonical notes',async()=>{
    await save(lane);
    for(const table of ['GteTrackInstrument','GteTrackPlaybackSetting','GteDrumLoopState'])await db.exec(`UPDATE "${table}" SET "updatedAt"='2000-01-01'`);
    await save({...lane,notes:[{id:1,startTime:0,length:120,midiNum:60,tab:[0,0],optimals:[]}]});
    for(const table of ['GteTrackInstrument','GteTrackPlaybackSetting','GteDrumLoopState'])expect((await db.query(`SELECT EXTRACT(YEAR FROM "updatedAt") AS year FROM "${table}"`)).rows[0].year).toBe('2000');
    const changed={...lane,instrumentId:'electric',playbackVolume:0.5,drumLoops:[{...lane.drumLoops![0],loopEnd:720}]};await save(changed);
    const payload={snapshot:{...lane,instrumentId:'acoustic',playbackVolume:1,drumLoops:[],notes:[{id:2,vibrato:true}]}};
    await hydrateTrackInstrumentsFromStore('canvas__ed__lane',payload);await hydrateTrackPlaybackFromStore('user','canvas__ed__lane',payload);await hydrateDrumLoopsFromStore('canvas__ed__lane',payload);
    expect(payload.snapshot.instrumentId).toBe('electric');expect(payload.snapshot.playbackVolume).toBe(0.5);expect(payload.snapshot.drumLoops).toEqual(changed.drumLoops);expect(payload.snapshot.notes).toEqual([{id:2,vibrato:true}]);
    for(const table of ['GteTrackInstrument','GteTrackPlaybackSetting','GteDrumLoopState'])expect((await db.query(`SELECT EXTRACT(YEAR FROM "updatedAt") AS year FROM "${table}"`)).rows[0].year).not.toBe('2000');
  });
});
