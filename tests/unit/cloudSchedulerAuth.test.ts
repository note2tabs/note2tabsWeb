import { afterEach, describe, expect, it, vi } from "vitest";
import { isAuthorizedSchedulerRequest } from "../../lib/cloudSchedulerAuth";

describe("Cloud Scheduler authentication", () => {
  afterEach(() => {
    delete process.env.CRON_SECRET;
    delete process.env.GOOGLE_CLOUD_SCHEDULER_SERVICE_ACCOUNT;
    delete process.env.GOOGLE_CLOUD_SCHEDULER_AUDIENCE;
  });

  it("accepts the existing cron secret", async () => {
    process.env.CRON_SECRET = "local-secret";
    await expect(isAuthorizedSchedulerRequest("Bearer local-secret")).resolves.toBe(true);
  });

  it("accepts only a verified token from the configured scheduler account", async () => {
    process.env.GOOGLE_CLOUD_SCHEDULER_SERVICE_ACCOUNT = "scheduler@example.iam.gserviceaccount.com";
    process.env.GOOGLE_CLOUD_SCHEDULER_AUDIENCE = "https://www.note2tabs.com/api/cron/inactive-signup-reminder";
    const verifyIdToken = vi.fn().mockResolvedValue({
      getPayload: () => ({ email: process.env.GOOGLE_CLOUD_SCHEDULER_SERVICE_ACCOUNT, email_verified: true }),
    });

    await expect(
      isAuthorizedSchedulerRequest("Bearer google-token", { verifyIdToken } as never)
    ).resolves.toBe(true);
    expect(verifyIdToken).toHaveBeenCalledWith({
      idToken: "google-token",
      audience: process.env.GOOGLE_CLOUD_SCHEDULER_AUDIENCE,
    });
  });

  it("rejects a valid token belonging to another service account", async () => {
    process.env.GOOGLE_CLOUD_SCHEDULER_SERVICE_ACCOUNT = "scheduler@example.iam.gserviceaccount.com";
    process.env.GOOGLE_CLOUD_SCHEDULER_AUDIENCE = "https://www.note2tabs.com/api/cron/inactive-signup-reminder";
    const verifyIdToken = vi.fn().mockResolvedValue({
      getPayload: () => ({ email: "other@example.iam.gserviceaccount.com", email_verified: true }),
    });

    await expect(
      isAuthorizedSchedulerRequest("Bearer google-token", { verifyIdToken } as never)
    ).resolves.toBe(false);
  });
});
