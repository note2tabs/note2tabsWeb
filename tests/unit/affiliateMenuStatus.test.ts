import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ session: vi.fn(), findUnique: vi.fn() }));
vi.mock("next-auth/next", () => ({ getServerSession: mocks.session }));
vi.mock("../../lib/prisma", () => ({ prisma: { affiliate: { findUnique: mocks.findUnique } } }));
vi.mock("../../pages/api/auth/[...nextauth]", () => ({ authOptions: {} }));
import handler from "../../pages/api/affiliate/status";

function response() {
  const res = { setHeader: vi.fn(), status: vi.fn(), json: vi.fn() };
  res.status.mockReturnValue(res);
  return res;
}
describe("affiliate profile-menu membership", () => {
  beforeEach(() => vi.resetAllMocks());
  it("does not query membership for a signed-out visitor", async () => {
    mocks.session.mockResolvedValue(null);
    const res = response();
    await handler({ method: "GET" } as any, res as any);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(mocks.findUnique).not.toHaveBeenCalled();
    expect(res.setHeader).toHaveBeenCalledWith("Cache-Control", "private, no-store");
  });
  it.each([null, { id: "affiliate" }])("uses the authenticated account only (%j)", async affiliate => {
    mocks.session.mockResolvedValue({ user: { id: "signed-in-user" } });
    mocks.findUnique.mockResolvedValue(affiliate);
    const res = response();
    await handler({ method: "GET", query: { userId: "another-user" } } as any, res as any);
    expect(mocks.findUnique).toHaveBeenCalledWith({ where: { userId: "signed-in-user" }, select: { id: true } });
    expect(res.json).toHaveBeenCalledWith({ isAffiliate: Boolean(affiliate) });
  });
  it("rejects writes without looking up membership", async () => {
    const res = response();
    await handler({ method: "POST" } as any, res as any);
    expect(res.status).toHaveBeenCalledWith(405);
    expect(mocks.session).not.toHaveBeenCalled();
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });
});
