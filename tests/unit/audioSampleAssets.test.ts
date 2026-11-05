import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";
import { getTrackInstrumentOptions } from "../../lib/gteInstrumentManifest";
import { DRUM1_SAMPLE_URLS } from "../../lib/gteDrumPlayback";
import versions from "../../lib/gteSampleVersions.json";

it("ships a versioned MP3 fallback for every playable sampled instrument and drum", () => {
  const urls = new Set([
    ...getTrackInstrumentOptions().flatMap(option => option.samples.map(sample => sample.url)),
    ...Object.values(DRUM1_SAMPLE_URLS),
  ]);
  expect(urls.size).toBe(235);
  for (const url of urls) {
    const path = decodeURIComponent(url.split("?")[0]).replace(/^\/sound_samples\//, "").replace(/\.opus$/, ".mp3");
    const bytes = readFileSync(resolve("public/sound_samples", path));
    expect(bytes.length, path).toBeGreaterThan(100);
    expect(bytes.subarray(0,3).toString(), path).toBe("ID3");
    expect((versions as Record<string, string>)[path], path)
      .toBe(createHash("sha256").update(bytes).digest("hex").slice(0,12));
  }
});
