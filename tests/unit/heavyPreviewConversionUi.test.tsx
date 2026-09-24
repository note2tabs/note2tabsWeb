import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import HeavyPreviewEditorPrompt from "../../components/HeavyPreviewEditorPrompt";
import HeavyPreviewIntroDialog from "../../components/HeavyPreviewIntroDialog";

describe("Heavy preview conversion UI", () => {
  it("requires a clear confirmation before spending the one-time preview", () => {
    const html = renderToStaticMarkup(
      <HeavyPreviewIntroDialog open onCancel={vi.fn()} onConfirm={vi.fn()} />
    );

    expect(html).toContain("Use your free Heavy model preview?");
    expect(html).toContain("account’s only free Heavy model transcription");
    expect(html).toContain("available only with Premium or Pro");
    expect(html).toContain("30 sec");
    expect(html).toContain("Not yet");
    expect(html).toContain("Use my preview");
  });

  it("offers Premium after the preview result reaches the editor", () => {
    const html = renderToStaticMarkup(
      <HeavyPreviewEditorPrompt open onClose={vi.fn()} onUpgrade={vi.fn()} />
    );

    expect(html).toContain("Keep using the Heavy model");
    expect(html).toContain("Your preview used our most accurate model");
    expect(html).toContain("View plans");
    expect(html).toContain("Continue editing");
    expect(html).toContain("Plans from $5.99/month");
  });

  it("renders nothing when the editor prompt is closed", () => {
    expect(
      renderToStaticMarkup(
        <HeavyPreviewEditorPrompt open={false} onClose={vi.fn()} onUpgrade={vi.fn()} />
      )
    ).toBe("");
  });
});
