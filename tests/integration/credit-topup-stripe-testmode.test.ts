/** Opt-in real Stripe TEST-mode checkout + isolated PostgreSQL. Never live. */
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
import {Readable} from 'node:stream';
import Stripe from 'stripe';
import {PrismaClient} from '@prisma/client';
import {PrismaPg} from '@prisma/adapter-pg';
import {createMocks,createResponse} from 'node-mocks-http';
import {beforeAll,afterAll,describe,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({db:null as any,stripe:null as any,session:null as any}));
vi.mock('../../lib/prisma',()=>({get prisma(){return m.db;}}));
vi.mock('../../lib/stripe',()=>({get stripeClient(){return m.stripe;}}));
vi.mock('next-auth/next',()=>({getServerSession:async()=>m.session}));
vi.mock('../../pages/api/auth/[...nextauth]',()=>({authOptions:{}}));
vi.mock('../../lib/urls',()=>({getAppBaseUrl:()=> 'http://localhost:3118'}));
import createCheckout from '../../pages/api/stripe/credit-top-up';
import webhook from '../../pages/api/stripe/webhook';
import readStatus from '../../pages/api/stripe/credit-top-up-status';
const phase=process.env.CREDIT_TOPUP_STRIPE_TEST_PHASE;
const receipt='/tmp/n2t-credit-topup-e2e-test.json';
function cli(path:string,params:Record<string,unknown>={},post=false){
 const args=[post?'post':'get',path];
 const add=(key:string,value:unknown)=>{if(value===undefined||value===null)return;if(typeof value==='object'){for(const [k,v]of Object.entries(value))add(`${key}[${k}]`,v);}else args.push('-d',`${key}=${String(value)}`);};
 for(const [key,value]of Object.entries(params))add(key,value);
 const result=JSON.parse(execFileSync('stripe',args,{encoding:'utf8',timeout:30000,stdio:['ignore','pipe','pipe']}));
 if(result.error)throw Error(result.error.message);
 if(result.livemode===true)throw Error('Live Stripe object forbidden');
 return result;
}
describe.skipIf(!phase)('Stripe TEST-only credit purchase journey',()=>{
 let db:PrismaClient;
 beforeAll(()=>{
  const url=process.env.CREDIT_TOPUP_TEST_DATABASE_URL!;const parsed=new URL(url);if(!['127.0.0.1','localhost'].includes(parsed.hostname)||parsed.pathname!=='/n2t_credit_topup_test')throw Error('Disposable local PostgreSQL required');
  db=new PrismaClient({adapter:new PrismaPg({connectionString:url})});m.db=db;
  m.stripe={checkout:{sessions:{create:async(params:any)=>cli('/v1/checkout/sessions',params,true),retrieve:async(id:string,params:any)=>cli(`/v1/checkout/sessions/${id}`,params)}},paymentIntents:{retrieve:async(id:string)=>cli(`/v1/payment_intents/${id}`)},webhooks:new Stripe('sk_test_local_signature_only').webhooks};
  vi.stubEnv('CREDIT_TOPUPS_ENABLED','true');vi.stubEnv('STRIPE_CREDIT_TOPUP_PRODUCT_ID','prod_VTdIKonGxtVbNE');vi.stubEnv('STRIPE_WEBHOOK_SECRET','whsec_local_credit_test');vi.stubEnv('STRIPE_PRICE_PREMIUM_MONTHLY','price_test_config_only');
 });
 afterAll(async()=>{await db?.$disconnect();vi.unstubAllEnvs();});
 async function deliver(type:string,object:any,invalid=false){
  const payload=JSON.stringify({id:`evt_local_${type}`,object:'event',type,data:{object}});
  const req=Readable.from([Buffer.from(payload)]) as any;req.method='POST';req.headers={'stripe-signature':invalid?'bad':m.stripe.webhooks.generateTestHeaderString({payload,secret:'whsec_local_credit_test'})};const res=createResponse();await webhook(req,res as any);return res;
 }
 it('creates or verifies the actual paid checkout and signed fulfillment',async()=>{
  if(phase==='prepare'){
   expect(cli('/v1/products/prod_VTdIKonGxtVbNE').livemode).toBe(false);
   const user=await db.user.create({data:{email:`credit-e2e-${Date.now()}@example.test`,role:'FREE',subscriptionPlan:'FREE',tokensRemaining:10}});m.session={user:{id:user.id}};
   const {req,res}=createMocks({method:'POST',headers:{origin:'http://localhost:3118'},body:{credits:30,locale:'en'}});await createCheckout(req as any,res as any);expect(res.statusCode).toBe(200);const result=res._getJSONData();const order=await db.creditTopUpOrder.findUniqueOrThrow({where:{id:result.orderId}});writeFileSync(receipt,JSON.stringify({userId:user.id,orderId:order.id,sessionId:order.checkoutSessionId,url:result.url}),{mode:0o600});
   expect(cli(`/v1/checkout/sessions/${order.checkoutSessionId}`).payment_status).toBe('unpaid');return;
  }
  const r=JSON.parse(readFileSync(receipt,'utf8'));m.session={user:{id:r.userId}};
  const session=cli(`/v1/checkout/sessions/${r.sessionId}`,{'expand[]':'payment_intent.latest_charge'});expect(session.livemode).toBe(false);expect(session.payment_status).toBe('paid');expect(session.amount_total).toBe(249);
  const balance=async()=>(await db.$queryRaw<Array<{credits:number}>>`SELECT credits FROM user_credits WHERE "userId"=${r.userId}`)[0]?.credits;
  expect((await deliver('checkout.session.completed',session,true)).statusCode).toBe(400);
  for(const type of ['checkout.session.completed','checkout.session.async_payment_succeeded','checkout.session.completed'])expect((await deliver(type,session)).statusCode).toBe(200);
  expect(await balance()).toBe(40);expect((await db.user.findUniqueOrThrow({where:{id:r.userId}})).role).toBe('FREE');
  const {req,res}=createMocks({method:'GET',query:{session_id:r.sessionId}});await readStatus(req as any,res as any);expect(res._getJSONData()).toMatchObject({fulfilled:true,credits:30});
  const refund=cli('/v1/refunds',{payment_intent:session.payment_intent.id},true);expect(refund.status).toBe('succeeded');
  const charge=cli(`/v1/charges/${session.payment_intent.latest_charge.id}`);expect((await deliver('charge.refunded',charge)).statusCode).toBe(200);expect(await balance()).toBe(10);expect((await deliver('charge.refunded',charge)).statusCode).toBe(200);expect(await balance()).toBe(10);
  writeFileSync('/tmp/n2t-credit-topup-e2e-result.json',JSON.stringify({testMode:true,amountCents:249,creditedOnce:30,refunded:true,remaining:await balance(),signatureVerified:true}),{mode:0o600});
 },120000);
});
