import {beforeAll,afterAll,beforeEach,describe,it,expect,vi} from "vitest";
import {Client} from "pg";
import {readFile} from "node:fs/promises";
const m=vi.hoisted(()=>({db:null as any}));
vi.mock("../../lib/prisma",()=>({prisma:new Proxy({},{get:(_,k)=>m.db[k]})}));
import {persistPostHogCaptures,retryPostHogCaptures,deletePostHogCapturesForAccount} from "../../lib/posthogOutbox";
const url=process.env.N2T_ANALYTICS_TEST_DB_URL;
if(url){const u=new URL(url);if(!["localhost","127.0.0.1"].includes(u.hostname)||u.pathname!=="/analytics_test")throw new Error("Disposable local analytics_test database required");}
describe.skipIf(!url)("PostHog outbox with real PostgreSQL",()=>{
 let db:Client;
 const payload={uuid:"event-1",event:"subscription_started",distinct_id:"test-account",timestamp:"2026-10-17T12:00:00.000Z",properties:{amount:5}};
 beforeAll(async()=>{
  db=new Client({connectionString:url});await db.connect();await db.query("BEGIN");
  const migration=await readFile("prisma/migrations/20261017230000_analytics_delivery_outbox/migration.sql","utf8");
  await db.query(migration.replace('CREATE TABLE "AnalyticsDeliveryOutbox"','CREATE TEMP TABLE "AnalyticsDeliveryOutbox"'));
  const query=(strings:TemplateStringsArray,...values:unknown[])=>db.query(strings.reduce((s,p,i)=>s+(i?`$${i}`:"")+p,""),values);
  m.db={$queryRaw:async(...args:any[])=>(await (query as any)(...args)).rows,$executeRaw:async(...args:any[])=>(await (query as any)(...args)).rowCount};
 });
 afterAll(async()=>{if(db){await db.query("ROLLBACK");await db.end();}});
 beforeEach(async()=>{await db.query('TRUNCATE "AnalyticsDeliveryOutbox"');});
 it("persists before a failed send, then replays unchanged time, identity and properties",async()=>{
  const send=vi.fn().mockRejectedValueOnce(new Error("PostHog unavailable")).mockResolvedValue(undefined);
  await expect(persistPostHogCaptures([payload],send)).rejects.toThrow("unavailable");
  expect((await db.query('SELECT * FROM "AnalyticsDeliveryOutbox"')).rows[0].deliveredAt).toBeNull();
  await persistPostHogCaptures([{...payload,timestamp:"2026-10-18T12:00:00.000Z",properties:{amount:99}}],send);
  expect(send.mock.calls[1][0]).toEqual([payload]);
  await persistPostHogCaptures([payload],send);expect(send).toHaveBeenCalledTimes(2);
 });
 it("retries pending rows after process memory is gone and excludes delivered rows",async()=>{
  await expect(persistPostHogCaptures([payload],vi.fn().mockRejectedValue(new Error("offline")))).rejects.toThrow();
  const send=vi.fn().mockResolvedValue(undefined);expect(await retryPostHogCaptures(send)).toBe(1);expect(send).toHaveBeenCalledWith([payload]);expect(await retryPostHogCaptures(send)).toBe(0);
 });
 it("replays the same event when delivery succeeds but database acknowledgement fails",async()=>{
  const execute=m.db.$executeRaw;m.db.$executeRaw=vi.fn().mockRejectedValueOnce(new Error("ack unavailable"));const send=vi.fn().mockResolvedValue(undefined);
  await expect(persistPostHogCaptures([payload],send)).rejects.toThrow("ack unavailable");m.db.$executeRaw=execute;
  await retryPostHogCaptures(send);expect(send.mock.calls[0][0]).toEqual(send.mock.calls[1][0]);
 });
 it("deduplicates concurrent writers and preserves undelivered rows during cleanup",async()=>{
  const send=vi.fn().mockResolvedValue(undefined);await Promise.all([persistPostHogCaptures([payload],send),persistPostHogCaptures([payload],send)]);
  expect((await db.query('SELECT count(*) FROM "AnalyticsDeliveryOutbox"')).rows[0].count).toBe("1");
  for(const [batch] of send.mock.calls)expect(batch).toEqual([payload]);
  await db.query('UPDATE "AnalyticsDeliveryOutbox" SET "createdAt"=NOW()-INTERVAL \'100 days\',"deliveredAt"=NULL');
  await expect(retryPostHogCaptures(vi.fn().mockRejectedValue(new Error("offline")))).rejects.toThrow();
  expect((await db.query('SELECT count(*) FROM "AnalyticsDeliveryOutbox"')).rows[0].count).toBe("1");
 });
 it("purges a deleted account without deleting another account's pending data",async()=>{
  await expect(persistPostHogCaptures([payload,{...payload,uuid:"event-2",distinct_id:"other-account"}],vi.fn().mockRejectedValue(new Error("offline")))).rejects.toThrow();
  await deletePostHogCapturesForAccount("test-account");
  const rows=(await db.query('SELECT "payload" FROM "AnalyticsDeliveryOutbox"')).rows;expect(rows).toHaveLength(1);expect(rows[0].payload.distinct_id).toBe("other-account");
 });

});
