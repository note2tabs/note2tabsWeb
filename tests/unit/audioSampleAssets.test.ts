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
  expect(urls.size).toBeGreaterThan(235);
  for (const url of urls) {
    const path = decodeURIComponent(url.split("?")[0]).replace(/^\/sound_samples\//, "").replace(/\.opus$/, ".mp3");
    const bytes = readFileSync(resolve("public/sound_samples", path));
    expect(bytes.length, path).toBeGreaterThan(100);
    expect(bytes.subarray(0,3).toString(), path).toBe("ID3");
    expect((versions as Record<string, string>)[path], path)
      .toBe(createHash("sha256").update(bytes).digest("hex").slice(0,12));
  }
});

it("ships valid unique roots and versioned Opus files for every bank", () => {
 const ids=new Set<string>();
 for(const bank of getTrackInstrumentOptions()) {
  expect(ids.has(bank.id),bank.id).toBe(false);ids.add(bank.id);
  const roots=new Set<number>();
  for(const sample of bank.samples) {
   expect(sample.gain, sample.url).toBeGreaterThan(0);
   expect(sample.gain, sample.url).toBeLessThanOrEqual(2);
   expect(Number.isInteger(sample.midi)&&sample.midi>=0&&sample.midi<=127,sample.url).toBe(true);
   expect(roots.has(sample.midi),sample.url).toBe(false);roots.add(sample.midi);
   const path=decodeURIComponent(sample.url.split("?")[0]).replace(/^\/sound_samples\//,"");
   const bytes=readFileSync(resolve("public/sound_samples",path));
   expect(bytes.subarray(0,4).toString(),path).toBe("OggS");
   expect((versions as Record<string,string>)[path],path).toBe(createHash("sha256").update(bytes).digest("hex").slice(0,12));
  }
 }
});
