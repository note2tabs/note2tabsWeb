import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { YOUTUBE_DOWNLOADS_AVAILABLE, YOUTUBE_UNAVAILABLE_MESSAGE } from "../../lib/youtubeAvailability";

describe("temporary YouTube shutdown", () => {
  it("uses the requested message and fails closed", () => {
    expect(YOUTUBE_DOWNLOADS_AVAILABLE).toBe(false);
    expect(YOUTUBE_UNAVAILABLE_MESSAGE).toBe("YouTube downloads are currently unavailable, we are working to restore them as fast as possible.");
  });
  it("rejects YouTube at the submission gate but leaves file mode untouched", () => {
    const source = readFileSync("pages/api/transcribe.ts","utf8");
    const start = source.indexOf('    if (mode === "YOUTUBE" && !YOUTUBE_DOWNLOADS_AVAILABLE)');
    const end = source.indexOf("    const requestedTranscriptionModel",start);
    expect(start).toBeGreaterThan(0); expect(end).toBeGreaterThan(start);
    const gate = source.slice(start,end);
    for (const mode of ["FILE","YOUTUBE"]) {
      let status: number | undefined, body: unknown;
      const res = {status:(value:number) => {status = value; return {json:(value:unknown) => {body = value;}};}};
      runInNewContext(`(function(){${gate}})()`,{mode,YOUTUBE_DOWNLOADS_AVAILABLE,YOUTUBE_UNAVAILABLE_MESSAGE,res});
      expect(status).toBe(mode === "YOUTUBE" ? 503 : undefined);
      if (mode === "YOUTUBE") expect(body).toEqual({error:YOUTUBE_UNAVAILABLE_MESSAGE,code:"youtube_downloads_unavailable"});
    }
  });
  it("disables YouTube submission and presents the notice without disabling uploads", () => {
    const source = readFileSync("pages/transcriber.tsx","utf8");
    expect(source.includes('if (mode === "FILE") return Boolean(selectedFile)')).toBe(true);
    expect(source.includes('return YOUTUBE_DOWNLOADS_AVAILABLE && youtubeValid')).toBe(true);
    expect(source.includes('disabled={!YOUTUBE_DOWNLOADS_AVAILABLE}')).toBe(true);
    expect(source.includes('role="status" className="my-4')).toBe(true);
  });
});
