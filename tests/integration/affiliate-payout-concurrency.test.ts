/** Run against a disposable local Postgres database with the payout migration applied.
 * AFFILIATE_PAYOUT_TEST_DATABASE_URL must name n2t_affiliate_payout_test on localhost.
 * Stripe is fully simulated: these tests cannot move funds. */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ db: null as any }));
vi.mock("../../lib/prisma", () => ({ get prisma() { return m.db; } }));
import { prepareAffiliatePayout, sendAffiliatePayout, reverseCommissionTransfer, withAffiliatePayoutLock } from "../../lib/affiliatePayouts";
const testUrl = process.env.AFFILIATE_PAYOUT_TEST_DATABASE_URL;
const now = new Date("2026-10-20T12:00:00Z");
const rates = { date: "2026-10-19", rates: { USD: 1, SEK: 10, EUR: 1 } };

describe.skipIf(!testUrl)("monthly affiliate payout database races", () => {
  let db: PrismaClient;
  let stripe: any;
  let affiliateId: string;
  let commissionIds: string[];
  const transfers: any[] = [];
  const reversals: any[] = [];
  beforeAll(() => {
    const url = new URL(testUrl!);
    if (!["localhost", "127.0.0.1"].includes(url.hostname) || url.pathname !== "/n2t_affiliate_payout_test") throw new Error("Payout tests require an isolated local database");
    db = new PrismaClient({ adapter: new PrismaPg({connectionString: testUrl!}) });
    m.db = db;
  });
  beforeEach(async () => {
    await db.affiliateCommission.deleteMany();
    await db.affiliatePayout.deleteMany();
    await db.affiliateAttribution.deleteMany();
    await db.affiliate.deleteMany();
    await db.user.deleteMany();
    const owner = await db.user.create({data:{email:"affiliate@example.test"}});
    const referred = await db.user.create({data:{email:"referred@example.test"}});
    const affiliate = await db.affiliate.create({data:{userId:owner.id,code:"TESTAFFILIATE",status:"ACTIVE",stripeAccountId:"acct_test"}});
    affiliateId = affiliate.id;
    const attribution = await db.affiliateAttribution.create({data:{affiliateId,referredUserId:referred.id,source:"test"}});
    commissionIds = [];
    for(let index=1;index<=3;index++) {
      const c = await db.affiliateCommission.create({data:{affiliateId,attributionId:attribution.id,stripeInvoiceId:`in_${index}`,stripeChargeId:`ch_${index}`,paymentNumber:index,grossAmount:10000,commissionAmount:2000,currency:"usd",availableAt:new Date("2026-09-01")}});
      commissionIds.push(c.id);
    }
    transfers.length=0;reversals.length=0;
    stripe = {
      charges:{retrieve:vi.fn().mockResolvedValue({amount:10000,currency:"usd",balance_transaction:{amount:100000,currency:"sek",available_on:1}})},
      accounts:{retrieve:vi.fn().mockResolvedValue({id:"acct_test",payouts_enabled:true,details_submitted:true}),update:vi.fn().mockResolvedValue({})},
      transfers:{
        list:vi.fn(async ({transfer_group}:any)=>({data:transfers.filter(t=>t.transfer_group===transfer_group)})),
        create:vi.fn(async (data:any)=>{const transfer={id:`tr_${transfers.length}`, ...data};transfers.push(transfer);return transfer;}),
        listReversals:vi.fn(async function* (){yield* reversals;}),
        createReversal:vi.fn(async (_id:any,data:any)=>{reversals.push(data);return {id:"rev_test",...data};}),
      },
    };
  });
  afterAll(async()=>{await db?.$disconnect();});
  it("serializes concurrent cron reservations and sends only once", async()=>{
    const batches=await Promise.all([1,2,3].map(()=>prepareAffiliatePayout(affiliateId,stripe,rates,now)));
    expect(new Set(batches.map(b=>b!.id)).size).toBe(1);
    expect(await db.affiliatePayout.count()).toBe(1);
    await Promise.all([1,2,3].map(()=>sendAffiliatePayout(batches[0]!.id,affiliateId,"acct_test",stripe)));
    expect(stripe.transfers.create).toHaveBeenCalledTimes(1);
    expect(await db.affiliateCommission.count({where:{status:"PAID"}})).toBe(3);
    expect(await prepareAffiliatePayout(affiliateId,stripe,rates,now)).toBeNull();
  });
  it("reconciles a transfer which succeeded but whose response was lost", async()=>{
    const batch=(await prepareAffiliatePayout(affiliateId,stripe,rates,now))!;
    stripe.transfers.create.mockImplementationOnce(async(data:any)=>{transfers.push({id:"tr_lost",...data});throw new Error("response lost");});
    await expect(sendAffiliatePayout(batch.id,affiliateId,"acct_test",stripe)).rejects.toThrow("response lost");
    expect((await db.affiliatePayout.findUniqueOrThrow({where:{id:batch.id}})).status).toBe("PENDING");
    await sendAffiliatePayout(batch.id,affiliateId,"acct_test",stripe);
    expect(stripe.transfers.create).toHaveBeenCalledTimes(1);
    expect((await db.affiliatePayout.findUniqueOrThrow({where:{id:batch.id}})).stripeTransferId).toBe("tr_lost");
  });
  it("reverses exactly one commission after a grouped transfer", async()=>{
    const batch=(await prepareAffiliatePayout(affiliateId,stripe,rates,now))!;
    await sendAffiliatePayout(batch.id,affiliateId,"acct_test",stripe);
    await withAffiliatePayoutLock(affiliateId,tx=>reverseCommissionTransfer(tx,stripe,commissionIds[0]));
    expect(stripe.transfers.createReversal).toHaveBeenCalledWith(expect.anything(),expect.objectContaining({amount:20000}),expect.anything());
    expect(await db.affiliateCommission.count({where:{status:"PAID"}})).toBe(2);
    expect(await db.affiliateCommission.count({where:{status:"REVERSED"}})).toBe(1);
  });
  it("cancels an unsent batch after a refund and carries the other earnings forward", async()=>{
    const batch=(await prepareAffiliatePayout(affiliateId,stripe,rates,now))!;
    await withAffiliatePayoutLock(affiliateId,tx=>reverseCommissionTransfer(tx,stripe,commissionIds[0]));
    await sendAffiliatePayout(batch.id,affiliateId,"acct_test",stripe);
    expect(stripe.transfers.create).not.toHaveBeenCalled();
    expect(await db.affiliateCommission.count({where:{status:"PENDING",payoutId:null}})).toBe(2);
    expect((await db.affiliatePayout.findUniqueOrThrow({where:{id:batch.id}})).status).toBe("CANCELLED");
  });
  it("keeps new earnings for a later month after paying the current batch", async()=>{
    const batch=(await prepareAffiliatePayout(affiliateId,stripe,rates,now))!;
    await sendAffiliatePayout(batch.id,affiliateId,"acct_test",stripe);
    const old=await db.affiliateCommission.findFirstOrThrow();
    await db.affiliateCommission.create({data:{affiliateId,attributionId:old.attributionId,stripeInvoiceId:"in_new",stripeChargeId:"ch_new",paymentNumber:4,grossAmount:10000,commissionAmount:6000,currency:"usd",availableAt:new Date("2026-09-01")}});
    expect(await prepareAffiliatePayout(affiliateId,stripe,rates,now)).toBeNull();
    const next=await prepareAffiliatePayout(affiliateId,stripe,rates,new Date("2026-11-01T00:00:00Z"));
    expect(next?.month).toBe("2026-11");
    expect(await db.affiliateCommission.count({where:{status:"PENDING"}})).toBe(1);
  });
  it("serializes a simultaneous refund and payout without losing or double-paying the commission", async()=>{
    const batch=(await prepareAffiliatePayout(affiliateId,stripe,rates,now))!;
    await Promise.all([
      sendAffiliatePayout(batch.id,affiliateId,"acct_test",stripe),
      withAffiliatePayoutLock(affiliateId,tx=>reverseCommissionTransfer(tx,stripe,commissionIds[0])),
    ]);
    expect(transfers.length).toBeLessThanOrEqual(1);
    expect((await db.affiliateCommission.findUniqueOrThrow({where:{id:commissionIds[0]}})).status).toBe("REVERSED");
    if(transfers.length) expect(reversals.reduce((sum,r)=>sum+r.amount,0)).toBe(20000);
    else expect(await db.affiliateCommission.count({where:{status:"PAID"}})).toBe(0);
  });

});
