import {afterAll,beforeAll,describe,it,expect,vi} from "vitest";
import {createRequire} from "node:module";
import {readFile} from "node:fs/promises";
const state=vi.hoisted(()=>({db:null as any}));
vi.mock("../../lib/prisma",()=>({prisma:new Proxy({},{get:(_,key)=>state.db[key]})}));
import {recordEngagementEvents} from "../../lib/engagement/server";
const modulePath=process.env.N2T_PGLITE_MODULE;
describe.skipIf(!modulePath)("engagement bulk SQL in isolated PostgreSQL",()=>{
 let db:any;
 beforeAll(async()=>{
  vi.stubEnv("ENGAGEMENT_SIGNALS_ENABLED","true");const {PGlite}=createRequire(import.meta.url)(modulePath!);db=new PGlite();
  await db.exec(`CREATE TABLE "User" (id text PRIMARY KEY);INSERT INTO "User" VALUES ('owner'),('other');`);
  await db.exec(await readFile("prisma/migrations/20261017010000_engagement_rules/migration.sql","utf8"));
  state.db={$executeRaw:vi.fn(async(strings:TemplateStringsArray,...values:unknown[])=>db.query(strings.reduce((sql,part,index)=>sql+(index?`$${index}`:"")+part,""),values))};
 });
 afterAll(async()=>{await db?.close();vi.unstubAllEnvs();});
 it("deduplicates retries without changing payload, timestamps or account ownership",async()=>{
  const events=Array.from({length:205},(_,i)=>({eventId:`event-${i}`,schemaVersion:2,name:"transcription_submission_blocked",ts:new Date(Date.now()-i*1000),props:{blocked_reason:"credits_exhausted"},rawOriginal:{}}));
  await recordEngagementEvents("owner",events);expect(state.db.$executeRaw).toHaveBeenCalledTimes(3);
  await recordEngagementEvents("owner",[...events,events[0]] as any);
  await recordEngagementEvents("other",[events[0]]);
  const {rows}=await db.query('SELECT "accountId",payload,"at", EXTRACT(EPOCH FROM "at")*1000 AS "epochMs" FROM "EngagementSignal"');
  expect(rows).toHaveLength(205);expect(rows.every((row:any)=>Number(row.epochMs)===row.payload.at)).toBe(true);expect(rows.every((row:any)=>row.accountId==="owner")).toBe(true);
  expect(rows.map((row:any)=>row.payload.at).sort()).toEqual(events.map(event=>event.ts.getTime()).sort());
  expect(rows.every((row:any)=>row.payload.reason==="credits_exhausted")).toBe(true);
 });
});
