import { afterEach, describe, expect, it, vi } from "vitest";
import { isEmailDeliveryConfigured, sendTransactionalEmail } from "../../lib/email";

const ENV_KEYS = [
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "AWS_SESSION_TOKEN",
  "AWS_REGION",
  "AWS_SES_REGION",
  "SES_SMTP_HOST",
  "SES_SMTP_PASS",
  "SES_SMTP_PASSWORD",
  "SES_SMTP_REGION",
  "SES_SMTP_USER",
  "SES_SMTP_USERNAME",
];

describe("email delivery configuration", () => {
  afterEach(() => {
    for (const key of ENV_KEYS) {
      vi.stubEnv(key, undefined);
    }
    vi.restoreAllMocks();
  });

  it("does not treat an SES region alone as configured delivery", async () => {
    vi.stubEnv("AWS_SES_REGION", "eu-north-1");
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(console, "log").mockImplementation(() => undefined);

    expect(isEmailDeliveryConfigured()).toBe(false);
    await expect(
      sendTransactionalEmail({
        to: "user@example.com",
        subject: "Test",
        html: "<p>Test</p>",
        text: "Test",
      })
    ).resolves.toBe(false);
  });
});
