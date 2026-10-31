import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { canDownloadYouTube, YOUTUBE_UNAVAILABLE_MESSAGE } from "../../lib/youtubeAvailability";

describe("temporary YouTube shutdown", () => {
  it("uses the requested message and admits only Premium/Pro entitlements", () => {
    for (const plan of ["FREE",undefined,"", "premium"]) expect(canDownloadYouTube(plan)).toBe(false);
    for (const plan of ["PREMIUM","PRO"]) expect(canDownloadYouTube(plan)).toBe(true);
    expect(YOUTUBE_UNAVAILABLE_MESSAGE).toBe("YouTube downloads are currently only available for premius/pro users, we are working on restoring functionality for all users.");
  });
  it("rejects YouTube at the submission gate but leaves file mode untouched", () => {
    const source = readFileSync("pages/api/transcribe.ts","utf8");
    const start = source.indexOf('    if (mode === "YOUTUBE" && !canDownloadYouTube(subscriptionPlan))');
    const end = source.indexOf("    const requestedTranscriptionModel",start);
    expect(start).toBeGreaterThan(0); expect(end).toBeGreaterThan(start);
    const gate = source.slice(start,end);
    for (const mode of ["FILE","YOUTUBE"]) for (const subscriptionPlan of ["FREE","PREMIUM","PRO"]) {
      let status: number | undefined, body: unknown;
      const res = {status:(value:number) => {status = value; return {json:(value:unknown) => {body = value;}};}};
      runInNewContext(`(function(){${gate}})()`,{mode,subscriptionPlan,canDownloadYouTube,YOUTUBE_UNAVAILABLE_MESSAGE,res});
      const blocked = mode === "YOUTUBE" && subscriptionPlan === "FREE";
      expect(status).toBe(blocked ? 403 : undefined);
      if (blocked) expect(body).toEqual({error:YOUTUBE_UNAVAILABLE_MESSAGE,code:"youtube_downloads_unavailable"});
    }
  });
  it("disables YouTube submission and presents the notice without disabling uploads", () => {
    const source = readFileSync("pages/transcriber.tsx","utf8");
    expect(source.includes('if (mode === "FILE") return Boolean(selectedFile)')).toBe(true);
    expect(source.includes('return youtubeDownloadsAvailable && youtubeValid')).toBe(true);
    expect(source.includes('disabled={!youtubeDownloadsAvailable}')).toBe(true);
    expect(source.includes('role="status" className="my-4')).toBe(true);
  });
});
