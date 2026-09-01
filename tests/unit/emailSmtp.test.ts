import { afterEach, describe, expect, it, vi } from "vitest";

const smtpMocks = vi.hoisted(() => {
  const sendMail = vi.fn().mockResolvedValue({ messageId: "message-1" });
  return {
    sendMail,
    createTransport: vi.fn(() => ({ sendMail })),
  };
});

vi.mock("nodemailer9", () => ({
  default: {
    createTransport: smtpMocks.createTransport,
  },
}));

import { sendTransactionalEmail } from "../../lib/email";

const SMTP_ENV_KEYS = [
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "AWS_SES_REGION",
  "AWS_REGION",
  "EMAIL_FROM",
  "SES_SMTP_HOST",
  "SES_SMTP_PASSWORD",
  "SES_SMTP_PORT",
  "SES_SMTP_USERNAME",
] as const;

describe("SMTP email delivery", () => {
  afterEach(() => {
    for (const key of SMTP_ENV_KEYS) {
      vi.stubEnv(key, undefined);
    }
    vi.clearAllMocks();
  });

  it("sends transactional mail through the isolated Nodemailer 9 transport", async () => {
    vi.stubEnv("SES_SMTP_HOST", "smtp.example.com");
    vi.stubEnv("SES_SMTP_PORT", "587");
    vi.stubEnv("SES_SMTP_USERNAME", "smtp-user");
    vi.stubEnv("SES_SMTP_PASSWORD", "smtp-password");
    vi.stubEnv("EMAIL_FROM", "Note2Tabs <no-reply@note2tabs.com>");

    await expect(
      sendTransactionalEmail({
        to: "customer@example.com",
        subject: "Your transcription",
        html: "<p>Your transcription is ready.</p>",
        text: "Your transcription is ready.",
      })
    ).resolves.toBe(true);

    expect(smtpMocks.createTransport).toHaveBeenCalledWith({
      host: "smtp.example.com",
      port: 587,
      secure: false,
      auth: {
        user: "smtp-user",
        pass: "smtp-password",
      },
      disableFileAccess: true,
      disableUrlAccess: true,
    });
    expect(smtpMocks.sendMail).toHaveBeenCalledWith({
      from: "Note2Tabs <no-reply@note2tabs.com>",
      to: "customer@example.com",
      subject: "Your transcription",
      html: "<p>Your transcription is ready.</p>",
      text: "Your transcription is ready.",
    });
  });

  it("tags reminder emails without changing ordinary email delivery", async () => {
    vi.stubEnv("SES_SMTP_HOST", "smtp.example.com");
    vi.stubEnv("SES_SMTP_USERNAME", "smtp-user");
    vi.stubEnv("SES_SMTP_PASSWORD", "smtp-password");

    await sendTransactionalEmail({
      to: "customer@example.com",
      subject: "Continue your tab",
      html: "<p>Continue</p>",
      analyticsCategory: "tab_return_reminder",
    });

    expect(smtpMocks.sendMail).toHaveBeenCalledWith(expect.objectContaining({
      headers: { "X-SES-MESSAGE-TAGS": "email_category=tab_return_reminder" },
    }));
  });
});
