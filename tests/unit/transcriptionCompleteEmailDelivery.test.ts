import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  createMarker: vi.fn(),
  deleteMarkers: vi.fn(),
  sendEmail: vi.fn(),
}));

vi.mock("../../lib/prisma", () => ({
  prisma: {
    tabJob: { findFirst: mocks.findFirst },
    verificationToken: {
      create: mocks.createMarker,
      deleteMany: mocks.deleteMarkers,
    },
  },
}));

vi.mock("../../lib/email", () => ({
  sendTransactionalEmail: mocks.sendEmail,
}));

import { sendTranscriptionCompleteEmailOnce } from "../../lib/transcriptionCompleteEmail";

describe("transcription completion email delivery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findFirst.mockResolvedValue({
      sourceLabel: "Autumn fall",
      gteEditorId: null,
      user: { email: "player@example.com", name: "Player" },
    });
    mocks.createMarker.mockResolvedValue({});
    mocks.deleteMarkers.mockResolvedValue({ count: 1 });
    mocks.sendEmail.mockResolvedValue(true);
  });

  it("claims an idempotency marker before sending", async () => {
    await expect(
      sendTranscriptionCompleteEmailOnce({ userId: "user-1", jobId: "job-1", tabJobId: "tab-1" })
    ).resolves.toBe(true);

    expect(mocks.createMarker).toHaveBeenCalledOnce();
    expect(mocks.sendEmail).toHaveBeenCalledOnce();
    expect(mocks.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "player@example.com",
        subject: "Your Note2Tabs transcription is ready",
      })
    );
  });

  it("does not send again when another completion poll already claimed the marker", async () => {
    mocks.createMarker.mockRejectedValueOnce({ code: "P2002" });

    await expect(
      sendTranscriptionCompleteEmailOnce({ userId: "user-1", jobId: "job-1", tabJobId: "tab-1" })
    ).resolves.toBe(false);

    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it("releases the marker after a delivery failure so a later poll can retry", async () => {
    mocks.sendEmail.mockRejectedValueOnce(new Error("SES unavailable"));

    await expect(
      sendTranscriptionCompleteEmailOnce({ userId: "user-1", jobId: "job-1", tabJobId: "tab-1" })
    ).rejects.toThrow("SES unavailable");

    expect(mocks.deleteMarkers).toHaveBeenCalledWith({
      where: expect.objectContaining({ identifier: "notice:transcription-complete:job-1" }),
    });
  });
});
