import { afterEach, describe, expect, it } from "vitest";
import { buildTranscriptionCompleteEmail } from "../../lib/transcriptionCompleteEmail";

describe("transcription completion email", () => {
  afterEach(() => {
    delete process.env.NEXT_PUBLIC_APP_URL;
  });

  it("links an unimported transcription through the route that opens its editor", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://www.note2tabs.com/";
    const email = buildTranscriptionCompleteEmail({
      name: "Noel Example",
      jobId: "job 123",
      sourceLabel: "Autumn <Fall>",
    });

    expect(email.subject).toBe("Your Note2Tabs transcription is ready");
    expect(email.editorUrl).toBe(
      "https://www.note2tabs.com/job/job%20123?source=transcription_complete_email"
    );
    expect(email.text).toContain("play, edit, practice, and export");
    expect(email.html).toContain("Autumn &lt;Fall&gt;");
    expect(email.html).not.toContain("Autumn <Fall>");
  });

  it("links directly to an editor when the transcription was already imported", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://www.note2tabs.com";
    const email = buildTranscriptionCompleteEmail({
      jobId: "job-123",
      editorId: "editor 456",
    });

    expect(email.editorUrl).toBe(
      "https://www.note2tabs.com/gte/editor%20456?source=transcription_complete_email"
    );
  });
});
