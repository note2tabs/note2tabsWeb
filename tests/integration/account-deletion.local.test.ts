import { beforeAll, afterAll, beforeEach, describe, it, expect, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
const m = vi.hoisted(() => ({ db: null as any }));
vi.mock("../../lib/prisma", () => ({ prisma: new Proxy({}, { get: (_, key) => {
  const value = m.db[key]; return typeof value === "function" ? value.bind(m.db) : value;
} }) }));
import { deleteAccountAndRecordCompletion } from "../../lib/accountDeletion";
const url = process.env.N2T_ANALYTICS_TEST_DB_URL;
if (url) { const u = new URL(url); if (u.hostname !== "127.0.0.1" || u.port !== "55441" || u.pathname !== "/analytics_test") throw Error("Disposable local deletion database required"); }
describe.skipIf(!url)("account deletion with real PostgreSQL transactions", () => {
  let db: PrismaClient;
  beforeAll(async () => {
    db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) }); m.db = db;
  });
  afterAll(async () => { await db?.$disconnect(); });
  beforeEach(async () => {
    await db.$executeRawUnsafe('DROP TRIGGER IF EXISTS reject_deletion_event ON "AnalyticsDeliveryOutbox"');
    await db.$executeRawUnsafe('TRUNCATE "User", "AnalyticsDeliveryOutbox" CASCADE');
  });
  async function fixture() {
    const user = await db.user.create({ data: { email: "local-delete-test@example.invalid" } });
    await db.tabJob.create({ data: { userId: user.id, sourceType: "file", resultJson: "{}" } });
    await db.canvases.create({ data: { user_id: user.id, canvas_id: "local-canvas", updated_at: new Date() } });
    await db.$executeRaw`INSERT INTO "AnalyticsDeliveryOutbox" (id,payload) VALUES ('old', ${JSON.stringify({distinct_id:user.id})}::jsonb)`;
    return user;
  }
  it("removes the account/data and commits exactly one anonymous receipt", async () => {
    const user = await fixture(); await deleteAccountAndRecordCompletion(user.id);
    expect(await db.user.count()).toBe(0); expect(await db.tabJob.count()).toBe(0); expect(await db.canvases.count()).toBe(0);
    const rows = await db.$queryRaw<Array<{payload:any}>>`SELECT payload FROM "AnalyticsDeliveryOutbox"`;
    expect(rows).toHaveLength(1); expect(rows[0].payload.event).toBe("account_deleted");
    expect(JSON.stringify(rows)).not.toContain(user.id);
  });
  it("does not double count concurrent or later retried deletions", async () => {
    const user = await fixture();
    const results = await Promise.allSettled([deleteAccountAndRecordCompletion(user.id), deleteAccountAndRecordCompletion(user.id)]);
    expect(results.filter(r=>r.status==="fulfilled")).toHaveLength(1);
    await expect(deleteAccountAndRecordCompletion(user.id)).rejects.toThrow();
    expect(await db.$queryRaw`SELECT id FROM "AnalyticsDeliveryOutbox"`).toHaveLength(1);
  });
  it("rolls back account/data deletion and pending-capture removal when receipt persistence fails", async () => {
    const user = await fixture();
    await db.$executeRawUnsafe(`CREATE OR REPLACE FUNCTION reject_deletion_event_fn() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.payload->>'event' = 'account_deleted' THEN RAISE EXCEPTION 'test outbox failure'; END IF; RETURN NEW; END $$`);
    await db.$executeRawUnsafe('CREATE TRIGGER reject_deletion_event BEFORE INSERT ON "AnalyticsDeliveryOutbox" FOR EACH ROW EXECUTE FUNCTION reject_deletion_event_fn()');
    await expect(deleteAccountAndRecordCompletion(user.id)).rejects.toThrow();
    expect(await db.user.count()).toBe(1); expect(await db.tabJob.count()).toBe(1); expect(await db.canvases.count()).toBe(1);
    const rows = await db.$queryRaw<Array<{id:string}>>`SELECT id FROM "AnalyticsDeliveryOutbox"`;
    expect(rows.map(r=>r.id)).toEqual(["old"]);
  });
});
