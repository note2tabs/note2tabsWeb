import {beforeAll,afterAll,beforeEach,afterEach,describe,it,expect,vi} from "vitest";
import {createMocks} from "node-mocks-http";
import {Pool, type PoolClient} from "pg";
import {readFile} from "node:fs/promises";
const m=vi.hoisted(()=>({db:null as any,sessionId:"test-existing",afterCommit:null as null|(()=>Promise<void>),send:vi.fn(),capture:vi.fn(),flush:vi.fn().mockResolvedValue(undefined)}));
vi.mock("../../lib/prisma",()=>({prisma:new Proxy({}, {get:(_,key)=>m.db[key]})}));
vi.mock("next-auth/next",()=>({getServerSession:async()=>m.sessionId?{user:{id:m.sessionId}}:null}));
vi.mock("../../pages/api/auth/[...nextauth]",()=>({authOptions:{}}));
vi.mock("../../lib/email",()=>({sendTransactionalEmail:m.send}));
vi.mock("../../lib/posthogServer",()=>({createPostHogServerClient:()=>({capture:m.capture,flush:m.flush,getFeatureFlag:async()=>"existing"}),createPostHogIngestClient:()=>({capture:m.capture,flush:m.flush}),stablePostHogEventUuid:(s:string)=>s,flushPostHogServerClientInBackground:vi.fn()}));
import {setReminderEmailPermission} from "../../lib/engagement/emailPermission";
import {getEngagementEnrollment,reserveEngagementContact,finishEngagementContact} from "../../lib/engagement/experiment";
import {runEngagementReminders} from "../../lib/engagement/reminderExperiment";
import permission from "../../pages/api/account/reminder-permission";
import unsubscribe from "../../pages/api/email/unsubscribe-reminders";
import experiment from "../../pages/api/engagement/experiment";
import {createReminderUnsubscribeToken} from "../../lib/reminderUnsubscribe";
import {emailLanguageProblems} from "../../lib/emailLanguage";

const url=process.env.N2T_ENGAGEMENT_TEST_DB_URL;
// This suite deliberately cannot run against a customer database.
if(url){const u=new URL(url);if(!["127.0.0.1","localhost"].includes(u.hostname)||u.pathname!=="/engagement_test")throw new Error("Local disposable engagement_test database required");}
describe.skipIf(!url)("engagement readiness against real PostgreSQL",()=>{
 let pool:Pool;
 function adapter(client:Pool|PoolClient):any{
  const query=(strings:TemplateStringsArray,...values:unknown[])=>client.query(strings.reduce((s,p,i)=>s+(i?`$${i}`:"")+p,""),values);
  return {$queryRaw:async(...args:any[])=> (await (query as any)(...args)).rows,$executeRaw:async(...args:any[])=>(await (query as any)(...args)).rowCount,
   user:{findUnique:async({where}:any)=>(await client.query('SELECT role,"subscriptionPlan","emailVerified","emailVerifiedBool" FROM "User" WHERE id=$1',[where.id])).rows[0]||null},
   verificationToken:{upsert:async({create}:any)=>client.query('INSERT INTO "VerificationToken" (identifier,token,expires) VALUES ($1,$2,$3) ON CONFLICT (identifier,token) DO UPDATE SET expires=EXCLUDED.expires',[create.identifier,create.token,create.expires])},
   $transaction:async(fn:any)=>{const c=await pool.connect();try{await c.query('BEGIN');const result=await fn(adapter(c));await c.query('COMMIT');if(m.afterCommit)await m.afterCommit();return result;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}};
 }
 beforeAll(async()=>{pool=new Pool({connectionString:url,max:12});m.db=adapter(pool);
  await pool.query('DROP TABLE IF EXISTS "EngagementEmailPermission","EngagementContact","EngagementEnrollment","EngagementSignal","EngagementDecision" CASCADE');
  for(const name of ['20261017010000_engagement_rules','20261017020000_engagement_experiment'])await pool.query(await readFile(`prisma/migrations/${name}/migration.sql`,'utf8'));
 });
 afterAll(async()=>pool?.end());
 beforeEach(async()=>{
  vi.stubEnv("ENGAGEMENT_SIGNALS_ENABLED","true");vi.stubEnv("ENGAGEMENT_EXPERIMENT_ENABLED","true");vi.stubEnv("NEXT_PUBLIC_ENGAGEMENT_EXPERIMENT_ENABLED","true");vi.stubEnv("ENGAGEMENT_REMINDERS_ENABLED","true");vi.stubEnv("EMAIL_UNSUBSCRIBE_SECRET","local-only-test-secret");vi.stubEnv("NEXT_PUBLIC_APP_URL","http://localhost:3111");
  await pool.query('TRUNCATE "User","VerificationToken",canvases,canvas_lanes,lane_notes CASCADE');
  m.sessionId="test-existing";m.afterCommit=null;m.send.mockReset().mockResolvedValue(true);m.capture.mockClear();
 });
 afterEach(()=>vi.unstubAllEnvs());
 async function seed(arm="existing",work=false){
  const id=`test-${arm}`;
  await pool.query('INSERT INTO "User" (id,email,"updatedAt","createdAt","lastActiveAt","emailVerifiedBool") VALUES ($1,$2,NOW(),NOW()-INTERVAL \'7 hours\',NOW()-INTERVAL \'3 days\',TRUE)',[id,`${id}@invalid.example`]);
  await pool.query('INSERT INTO "EngagementEnrollment" ("accountId",version,arm) VALUES ($1,\'engagement-policy-v1\',$2)',[id,arm]);
  await pool.query('INSERT INTO "AccountLanguage" ("accountId",locale) VALUES ($1,\'fr\')',[id]);
  if(work){
   await pool.query('INSERT INTO canvases (user_id,canvas_id,name,draft_revision,updated_at) VALUES ($1,$2,\'Synthetic tab\',2,NOW()-INTERVAL \'3 days\')',[id,`work-${id}`]);
   const lane=(await pool.query('INSERT INTO canvas_lanes (canvas_id,lane_id,lane_index,updated_at) VALUES ($1,\'test\',0,NOW()) RETURNING lane_key',[`work-${id}`])).rows[0].lane_key;
   await pool.query('INSERT INTO lane_notes (lane_key,note_id,start_time,length,midi_num,tab_string,tab_fret,updated_at) VALUES ($1,1,0,10,60,1,0,NOW())',[lane]);
   const event={id:`signal-${id}`,name:"gte_export_download_initiated",project:`work-${id}`,at:Date.now()-3*86400000};
   await pool.query('INSERT INTO "EngagementSignal" (id,"accountId",at,payload) VALUES ($1,$2,$3,$4)',[event.id,id,new Date(event.at),event]);
  }
  return id;
 }
 async function dispatch(campaign:"signup"|"tab"="signup",dryRun=false){const {req,res}=createMocks({method:"GET",query:dryRun?{dryRun:"1"}:{}});await runEngagementReminders(req as any,res as any,campaign);return res._getJSONData();}
 async function request(handler:any,body:any={},method:any="POST",headers:any={}){const {req,res}=createMocks({method,body,headers});await handler(req,res);return res;}
 it("defaults to no email permission and sends nothing",async()=>{await seed();expect((await dispatch()).sent).toBe(0);expect(m.send).not.toHaveBeenCalled();});
 it("records explicit permission provenance and uses only the authenticated account",async()=>{
  await seed();const r=await request(permission,{allowed:true,accountId:"someone-else"},"PUT");expect(r._getJSONData().allowed).toBe(true);
  const rows=(await pool.query('SELECT * FROM "EngagementEmailPermission"')).rows;expect(rows).toHaveLength(1);expect(rows[0]).toMatchObject({accountId:"test-existing",allowed:true,basis:"settings_explicit_v1"});expect(rows[0].recordedAt).toBeInstanceOf(Date);
 });
 it("rejects unauthenticated, cross-origin, non-boolean and unverified opt-ins",async()=>{
  await seed();m.sessionId="";expect((await request(permission,{allowed:true},"PUT"))._getStatusCode()).toBe(401);m.sessionId="test-existing";
  expect((await request(permission,{allowed:true},"PUT",{origin:"https://attacker.invalid",host:"localhost"}))._getStatusCode()).toBe(403);
  expect((await request(permission,{allowed:"true"},"PUT"))._getStatusCode()).toBe(400);
  await pool.query('UPDATE "User" SET "emailVerifiedBool"=FALSE');expect((await request(permission,{allowed:true},"PUT"))._getStatusCode()).toBe(409);
 });
 it("revokes permission from a signed unsubscribe and blocks the next send",async()=>{
  const id=await seed();await setReminderEmailPermission(id,true,"settings_explicit_v1");const r=await request(unsubscribe,{token:createReminderUnsubscribeToken(id)});expect(r._getStatusCode()).toBe(200);
  expect((await pool.query('SELECT allowed,basis FROM "EngagementEmailPermission"')).rows[0]).toMatchObject({allowed:false,basis:"unsubscribe_link_v1"});expect((await dispatch()).sent).toBe(0);expect(m.send).not.toHaveBeenCalled();
 });
 it("explicit re-subscription clears unsubscribe but never delivery suppression",async()=>{
  const id=await seed();await setReminderEmailPermission(id,false,"settings_explicit_v1");await pool.query('INSERT INTO "VerificationToken" VALUES ($1,$2,NOW()+INTERVAL \'1 year\')',[`email:reminders-delivery-suppressed:${id}`,"complaint"]);
  await setReminderEmailPermission(id,true,"settings_explicit_v1");expect((await request(permission,{},"GET"))._getJSONData().allowed).toBe(false);expect((await dispatch()).sent).toBe(0);
 });
 it("allows only one concurrent reservation across campaigns and keeps channels separate",async()=>{
  const id=await seed();const enrollment=await getEngagementEnrollment(id);
  const claims=await Promise.all(Array.from({length:12},(_,i)=>reserveEngagementContact(enrollment,"email",`campaign-${i}`)));
  expect(claims.filter(Boolean)).toHaveLength(1);expect(await reserveEngagementContact(enrollment,"premium","cta")).toBeTruthy();
 });
 it.each(["accepted","failed","cancelled","uncertain"] as const)("retains the cap after a %s outcome",async state=>{
  const id=await seed();const e=await getEngagementEnrollment(id);const contact=await reserveEngagementContact(e,"email","one");await finishEngagementContact(id,contact!,state);expect(await reserveEngagementContact(e,"email","two")).toBeNull();
 });
 it("honors the rolling seven-day boundary and legacy reminder history",async()=>{
  const id=await seed();const e=await getEngagementEnrollment(id);await reserveEngagementContact(e,"email","one");await pool.query('UPDATE "EngagementContact" SET "createdAt"=NOW()-INTERVAL \'7 days 1 second\'');expect(await reserveEngagementContact(e,"email","two")).toBeTruthy();
  await pool.query('DELETE FROM "EngagementContact"');await pool.query('INSERT INTO "VerificationToken" VALUES ($1,$2,NOW()+INTERVAL \'3650 days\')',[`reminder:inactive-transcriber:${id}`,"legacy"]);expect(await reserveEngagementContact(e,"email","three")).toBeNull();
 });
 it("control sends no email and reserves no CTA even with permission and value",async()=>{
  const id=await seed("control",true);m.sessionId=id;await setReminderEmailPermission(id,true,"settings_explicit_v1");expect((await dispatch("tab")).sent).toBe(0);expect((await request(experiment,{operation:"claim",checkpoint:"legacy",safeMoment:true}))._getJSONData().show).toBe(false);expect(m.send).not.toHaveBeenCalled();expect((await pool.query('SELECT * FROM "EngagementContact"')).rows).toHaveLength(0);
 });
 it.each(["existing","contextual"])("dispatches the %s arm once with valid French content",async arm=>{
  const id=await seed(arm,true);await setReminderEmailPermission(id,true,"settings_explicit_v1");expect((await dispatch("tab")).sent).toBe(1);expect((await dispatch("tab")).sent).toBe(0);expect(m.send).toHaveBeenCalledTimes(1);
  const email=m.send.mock.calls[0][0];expect(email.language.locale).toBe("fr");expect(emailLanguageProblems(email,email.language,"fr")).toEqual([]);
 });
 it("dry-run never enrolls, reserves or sends",async()=>{const id=await seed();await setReminderEmailPermission(id,true,"settings_explicit_v1");await pool.query('DELETE FROM "EngagementEnrollment"');await dispatch("signup",true);expect(m.send).not.toHaveBeenCalled();expect((await pool.query('SELECT * FROM "EngagementEnrollment"')).rows).toHaveLength(0);});
 it("an uncertain delivery cannot be automatically resent",async()=>{const id=await seed();await setReminderEmailPermission(id,true,"settings_explicit_v1");m.send.mockRejectedValue(new Error("SMTP timeout"));expect((await dispatch()).failed).toBe(1);await dispatch();expect(m.send).toHaveBeenCalledTimes(1);expect((await pool.query('SELECT state FROM "EngagementContact"')).rows[0].state).toBe("uncertain");});
 it("premium and recently active accounts never receive experimental emails",async()=>{const id=await seed("existing",true);await setReminderEmailPermission(id,true,"settings_explicit_v1");await pool.query('UPDATE "User" SET "lastActiveAt"=NOW()');expect((await dispatch("tab")).sent).toBe(0);await pool.query('UPDATE "User" SET role=\'PREMIUM\',"subscriptionPlan"=\'PREMIUM\'');expect((await dispatch("tab")).sent).toBe(0);});
 it.each(["existing","contextual"])("blocks the %s CTA during an active checkout or unresolved failure",async arm=>{
  const id=await seed(arm,true);m.sessionId=id;
  for(const name of ['checkout_started','transcription_failed']){
   await pool.query('DELETE FROM "EngagementSignal" WHERE id=\'unsafe\'');const event={id:'unsafe',at:Date.now()-10000,name};await pool.query('INSERT INTO "EngagementSignal" VALUES ($1,$2,$3,$4)',['unsafe',id,new Date(event.at),event]);
   expect((await request(experiment,{operation:'claim',checkpoint:arm==='existing'?'legacy':'playback_pause',safeMoment:true}))._getJSONData().show).toBe(false);
  }
  expect((await pool.query('SELECT * FROM "EngagementContact"')).rows).toHaveLength(0);
 });
 it("reserves the contextual CTA only at the approved checkpoint with enough value",async()=>{
  const id=await seed('contextual',true);m.sessionId=id;const event={id:'import',at:Date.now()-3*86400000,name:'gte_file_import_completed',project:`work-${id}`};await pool.query('INSERT INTO "EngagementSignal" VALUES ($1,$2,$3,$4)',['import',id,new Date(event.at),event]);
  expect((await request(experiment,{operation:'claim',checkpoint:'legacy',safeMoment:true}))._getJSONData().show).toBe(false);
  expect((await request(experiment,{operation:'claim',checkpoint:'playback_pause',safeMoment:false}))._getJSONData().show).toBe(false);
  expect((await request(experiment,{operation:'claim',checkpoint:'playback_pause',safeMoment:true}))._getJSONData()).toMatchObject({show:true,score:6});
  expect((await request(experiment,{operation:'claim',checkpoint:'playback_pause',safeMoment:true}))._getJSONData().show).toBe(false);
 });
 it("does not let a batch of already assigned control accounts starve a later candidate",async()=>{
  await pool.query(`INSERT INTO "User" (id,email,"updatedAt","createdAt","lastActiveAt","emailVerifiedBool") SELECT 'a-control-'||n,'control-'||n||'@invalid.example',NOW(),NOW()-INTERVAL '7 hours',NOW()-INTERVAL '3 days',TRUE FROM generate_series(1,110) n`);
  await pool.query(`INSERT INTO "EngagementEmailPermission" ("accountId",allowed,basis) SELECT id,TRUE,'test' FROM "User"`);
  await pool.query(`INSERT INTO "EngagementEnrollment" ("accountId",version,arm) SELECT id,'engagement-policy-v1','control' FROM "User"`);
  const id=await seed();await setReminderEmailPermission(id,true,'settings_explicit_v1');expect((await dispatch()).sent).toBe(1);expect(m.send).toHaveBeenCalledTimes(1);
 });
 it("reports uncertain delivery to the existing error alert pipeline",async()=>{
  const id=await seed();await setReminderEmailPermission(id,true,'settings_explicit_v1');m.send.mockRejectedValue(new Error('SMTP timeout'));await dispatch();
  expect(m.capture).toHaveBeenCalledWith(expect.objectContaining({event:'reminder_email_delivery_failed',distinctId:id}));expect(m.capture).toHaveBeenCalledWith(expect.objectContaining({event:'reminder_scheduler_run_completed',properties:expect.objectContaining({status:'completed_with_delivery_errors'})}));
 });
 it.each(["existing","contextual"])("preserves classic saved-tab markers beyond the experimental cap in %s",async arm=>{
  const id=await seed(arm,true);await setReminderEmailPermission(id,true,'settings_explicit_v1');expect((await dispatch('tab')).sent).toBe(1);
  const markers=(await pool.query('SELECT identifier,expires FROM "VerificationToken" ORDER BY identifier')).rows;expect(markers).toHaveLength(2);expect(markers.some(m=>m.identifier===`reminder:return-to-tab-cooldown:${id}`)).toBe(true);
  await pool.query('UPDATE "EngagementContact" SET "createdAt"=NOW()-INTERVAL \'8 days\'');await pool.query('DELETE FROM "EngagementDecision"');expect((await dispatch('tab')).sent).toBe(0);expect(m.send).toHaveBeenCalledTimes(1);
 });
 it("releases classic markers after a definite non-send but retains the experimental cap",async()=>{
  const id=await seed('existing',true);await setReminderEmailPermission(id,true,'settings_explicit_v1');m.send.mockResolvedValue(false);expect((await dispatch('tab')).failed).toBe(1);expect((await pool.query('SELECT * FROM "VerificationToken"')).rows).toHaveLength(0);expect((await pool.query('SELECT state FROM "EngagementContact"')).rows[0].state).toBe('failed');
 });
 it("retains classic markers after an uncertain transport result",async()=>{
  const id=await seed('existing',true);await setReminderEmailPermission(id,true,'settings_explicit_v1');m.send.mockRejectedValue(new Error('SMTP timeout'));expect((await dispatch('tab')).failed).toBe(1);expect((await pool.query('SELECT * FROM "VerificationToken"')).rows).toHaveLength(2);
 });
 it("honors revocation after reserving contact and classic markers, before SMTP",async()=>{
  const id=await seed('existing',true);await setReminderEmailPermission(id,true,'settings_explicit_v1');
  m.afterCommit=async()=>{if((await pool.query('SELECT * FROM "VerificationToken"')).rows.length===2){m.afterCommit=null;await pool.query('UPDATE "EngagementEmailPermission" SET allowed=FALSE WHERE "accountId"=$1',[id]);}};
  expect((await dispatch('tab')).sent).toBe(0);expect(m.send).not.toHaveBeenCalled();expect((await pool.query('SELECT state FROM "EngagementContact"')).rows[0].state).toBe('cancelled');
 });
});
