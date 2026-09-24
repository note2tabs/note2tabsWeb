import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import HeavyPreviewEditorPrompt from "../../components/HeavyPreviewEditorPrompt";
import HeavyPreviewIntroDialog from "../../components/HeavyPreviewIntroDialog";

describe("Heavy preview conversion UI", () => {
  it("requires a clear confirmation before spending the one-time preview", () => {
    const html = renderToStaticMarkup(
      <HeavyPreviewIntroDialog open onCancel={vi.fn()} onConfirm={vi.fn()} />
    );

    expect(html).toContain("Use your Heavy preview?");
    expect(html).toContain("one free preview");
    expect(html).toContain("30 seconds · No credits · Available once");
    expect(html).toContain("Not now");
    expect(html).toContain("Use Heavy preview");
  });

  it("offers Premium after the preview result reaches the editor", () => {
    const html = renderToStaticMarkup(
      <HeavyPreviewEditorPrompt open onClose={vi.fn()} onUpgrade={vi.fn()} />
    );

    expect(html).toContain("Your Heavy preview is ready");
    expect(html).toContain("Continue using Heavy with Premium or Pro");
    expect(html).toContain("View plans");
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
