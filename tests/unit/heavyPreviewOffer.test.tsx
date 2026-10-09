import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import HeavyPreviewOffer from "../../components/HeavyPreviewOffer";

describe("HeavyPreviewOffer", () => {
  it("explains the value and one-time limit before the preview is selected", () => {
    const html = renderToStaticMarkup(
      <HeavyPreviewOffer selected={false} onSelect={vi.fn()} />
    );

    expect(html).not.toContain("Free preview");
    expect(html).toContain("most accurate model");
    expect(html).toContain("30 seconds");
    expect(html).toContain("Try our Heavy model");
  });

  it("makes the selected Heavy state clear", () => {
    const html = renderToStaticMarkup(
      <HeavyPreviewOffer selected onSelect={vi.fn()} />
    );

    expect(html).toContain("Selected");
    expect(html).toContain('aria-pressed="true"');
  });
});
