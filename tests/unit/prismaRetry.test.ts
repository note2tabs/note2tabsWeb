import { describe, expect, it, vi } from "vitest";
import { withPrismaReadRetry } from "../../lib/prismaRetry";

describe("withPrismaReadRetry", () => {
  it("retries transient connection errors", async () => {
    const operation = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce({ code: "P1017" })
      .mockResolvedValueOnce("ok");

    await expect(withPrismaReadRetry(operation)).resolves.toBe("ok");
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it("does not retry non-transient errors", async () => {
    const error = { code: "P2002" };
    const operation = vi.fn<() => Promise<string>>().mockRejectedValue(error);

    await expect(withPrismaReadRetry(operation)).rejects.toBe(error);
    expect(operation).toHaveBeenCalledOnce();
  });

  it("stops after the configured number of attempts", async () => {
    const error = { code: "P2024" };
    const operation = vi.fn<() => Promise<string>>().mockRejectedValue(error);

    await expect(withPrismaReadRetry(operation, 2)).rejects.toBe(error);
    expect(operation).toHaveBeenCalledTimes(2);
  });
});
