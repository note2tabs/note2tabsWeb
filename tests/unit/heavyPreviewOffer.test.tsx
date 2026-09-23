import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import HeavyPreviewOffer from "../../components/HeavyPreviewOffer";

describe("HeavyPreviewOffer", () => {
  it("explains the value and one-time limit before the preview is selected", () => {
    const html = renderToStaticMarkup(
      <HeavyPreviewOffer selected={false} onSelect={vi.fn()} />
    );

    expect(html).toContain("Try our most accurate model free");
    expect(html).toContain("once on any 30-second section");
    expect(html).toContain("No credits needed");
    expect(html).toContain("Use free preview");
  });

  it("makes the selected Heavy state clear", () => {
    const html = renderToStaticMarkup(
      <HeavyPreviewOffer selected onSelect={vi.fn()} />
    );

    expect(html).toContain("Heavy selected");
    expect(html).toContain('aria-pressed="true"');
  });
});
