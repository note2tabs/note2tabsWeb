import { afterEach, describe, expect, it, vi } from "vitest";
import { TranscriptionUploadError, uploadTranscriptionFile } from "../../lib/transcriptionUpload";

const file = new File(["abc"], "song.mp3", { type: "audio/mpeg" });
const reject = (status: number, body: Record<string, unknown>) =>
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status })));
const failure = async () => {
  try { await uploadTranscriptionFile(file, "song.mp3", "transfer failed"); } catch (error) { return error as TranscriptionUploadError; }
  throw new Error("expected the upload to be rejected");
};
afterEach(() => vi.unstubAllGlobals());

describe("presign rejection for an unverified email", () => {
  it("keeps the server's verificationRequired flag so the page can show the verification card", async () => {
    reject(403, { error: "Please verify your email to continue using the transcriber.", verificationRequired: true });
    const error = await failure();
    expect(error).toBeInstanceOf(TranscriptionUploadError);
    expect(error.verificationRequired).toBe(true);
    expect(error.stage).toBe("upload_presign");
    expect(error.details.http_status).toBe(403);
  });
  it("does not mistake other rejections for a verification problem", async () => {
    reject(413, { error: "This file exceeds your plan's 50 MB upload limit.", maxBytes: 52428800 });
    const tooLarge = await failure();
    expect(tooLarge.verificationRequired).toBe(false);
    expect(tooLarge.message).toContain("50 MB");
    reject(403, { error: "Something else was refused." });
    expect((await failure()).verificationRequired).toBe(false);
  });
  it("falls back to the transfer message for an unreadable response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>", { status: 502 })));
    const error = await failure();
    expect(error.message).toBe("transfer failed");
    expect(error.verificationRequired).toBe(false);
  });
});
