import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const PUBLIC_POSITIONING_FILES = [
  "pages/editor/index.tsx",
  "pages/ai-guitar-tab-generator.tsx",
  "pages/audio-to-guitar-tab-converter.tsx",
  "pages/youtube-to-guitar-tabs.tsx",
  "pages/mp3-to-guitar-tabs.tsx",
  "pages/free-guitar-tab-maker.tsx",
  "pages/online-guitar-tab-editor.tsx",
  "pages/features/index.tsx",
  "pages/index.tsx",
  "pages/transcriber.tsx",
  "components/FeatureLandingPage.tsx",
  "lib/seoFeaturePages.ts",
] as const;

const readSource = (file: string) =>
  readFileSync(resolve(process.cwd(), file), "utf8");

describe("product positioning", () => {
  it("does not describe transcription as a rough result that needs repair", () => {
    const copy = PUBLIC_POSITIONING_FILES.map(readSource).join("\n");

    expect(copy).not.toMatch(
      /\b(rough transcription|first draft|transcription draft|generated draft|fix an AI-generated tab)\b/i
    );
    expect(copy).not.toMatch(/\b(clean up|cleanup)\b.{0,80}\b(transcription|generated tab)\b/i);
  });

  it("positions the editor as complete and independent while keeping transcription connected", () => {
    const editorCopy = readSource("pages/editor/index.tsx");
    const featureCopy = readSource("pages/features/index.tsx");

    expect(editorCopy).toContain(
      "Create, arrange, play, practise, and organize guitar tabs in a complete browser-based editor."
    );
    expect(editorCopy).toContain(
      "transcription is an optional starting point rather than a requirement"
    );
    expect(featureCopy).toContain(
      "The editor stands on its own, while the transcriber gives you another powerful way to begin."
    );
  });
});
