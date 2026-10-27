import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ transaction: vi.fn() }));
vi.mock("../../lib/prisma", () => ({ prisma: { $transaction: m.transaction } }));
import { deleteAccountAndRecordCompletion } from "../../lib/accountDeletion";
const tx = () => ({
  $executeRaw: vi.fn().mockResolvedValue(1),
  tabJob: { deleteMany: vi.fn() }, canvases: { deleteMany: vi.fn() },
  account: { deleteMany: vi.fn() }, session: { deleteMany: vi.fn() },
  user: { delete: vi.fn().mockResolvedValue({ id: "private-account" }) },
});
describe("anonymous account deletion completion", () => {
  beforeEach(() => { m.transaction.mockReset(); });
  it("records completion in the deletion transaction without retaining account identity", async () => {
    const db = tx(); m.transaction.mockImplementation(run => run(db));
    await deleteAccountAndRecordCompletion("private-account");
    expect(m.transaction).toHaveBeenCalledOnce();
    expect(db.user.delete).toHaveBeenCalledWith({ where: { id: "private-account" } });
    const insert = db.$executeRaw.mock.calls[1];
    const payload = JSON.parse(insert[2] as string);
    expect(payload.event).toBe("account_deleted");
    expect(payload.uuid).toBe(insert[1]);
    expect(payload.distinct_id).toBe("system:account-deletions");
    expect(payload.properties).toMatchObject({ $process_person_profile: false, $geoip_disable: true });
    expect(JSON.stringify(payload)).not.toContain("private-account");
    expect(Object.keys(payload.properties).sort()).toEqual(["$geoip_disable", "$process_person_profile", "environment", "event_source", "schema_version"]);
    expect(db.user.delete.mock.invocationCallOrder[0]).toBeLessThan(db.$executeRaw.mock.invocationCallOrder[1]);
  });
  it("does not enqueue completion on failed or repeated deletion", async () => {
    const db = tx(); db.user.delete.mockRejectedValue(new Error("account not found"));
    m.transaction.mockImplementation(run => run(db));
    await expect(deleteAccountAndRecordCompletion("gone")).rejects.toThrow("not found");
    expect(db.$executeRaw).toHaveBeenCalledOnce();
  });
  it("fails the transaction if the completion receipt cannot be persisted", async () => {
    const db = tx(); db.$executeRaw.mockResolvedValueOnce(1).mockRejectedValueOnce(new Error("outbox unavailable"));
    m.transaction.mockImplementation(run => run(db));
    await expect(deleteAccountAndRecordCompletion("private-account")).rejects.toThrow("outbox unavailable");
  });
});
