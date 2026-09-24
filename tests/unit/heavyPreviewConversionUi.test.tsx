import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import HeavyPreviewEditorPrompt from "../../components/HeavyPreviewEditorPrompt";
import HeavyPreviewIntroDialog from "../../components/HeavyPreviewIntroDialog";

describe("Heavy preview conversion UI", () => {
  it("requires a clear confirmation before spending the one-time preview", () => {
    const html = renderToStaticMarkup(
      <HeavyPreviewIntroDialog open onCancel={vi.fn()} onConfirm={vi.fn()} />
    );

    expect(html).toContain("Use your preview on this transcription?");
    expect(html).toContain("single free preview");
    expect(html).toContain("Save for later");
    expect(html).toContain("Use Heavy once");
  });

  it("offers Premium after the preview result reaches the editor", () => {
    const html = renderToStaticMarkup(
      <HeavyPreviewEditorPrompt open onClose={vi.fn()} onUpgrade={vi.fn()} />
    );

    expect(html).toContain("Your Heavy preview is now in the editor");
    expect(html).toContain("Want to use Heavy again?");
    expect(html).toContain("See Premium");
    expect(html).toContain("Continue editing");
  });

  it("renders nothing when the editor prompt is closed", () => {
    expect(
      renderToStaticMarkup(
        <HeavyPreviewEditorPrompt open={false} onClose={vi.fn()} onUpgrade={vi.fn()} />
      )
    ).toBe("");
  });
});
