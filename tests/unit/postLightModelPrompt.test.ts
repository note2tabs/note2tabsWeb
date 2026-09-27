import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import PostLightModelPrompt from "../../components/PostLightModelPrompt";

const renderPrompt = (recommendation: "medium" | "heavy_preview", open = true) =>
  renderToStaticMarkup(
    createElement(PostLightModelPrompt, {
      open,
      recommendation,
      onClose: vi.fn(),
      onTryAgain: vi.fn(),
    })
  );

describe("PostLightModelPrompt", () => {
  it("explains the free Heavy preview to eligible users", () => {
    const html = renderPrompt("heavy_preview");

    expect(html).toContain("Want our best accuracy?");
    expect(html).toContain("This tab used our Light model");
    expect(html).toContain("one free 30-second preview");
    expect(html).toContain("Try Heavy free");
  });

  it("recommends Medium without promising a Heavy preview", () => {
    const html = renderPrompt("medium");

    expect(html).toContain("Want more accuracy?");
    expect(html).toContain("Try Medium");
    expect(html).not.toContain("free 30-second preview");
  });

  it("renders nothing while closed", () => {
    expect(renderPrompt("medium", false)).toBe("");
  });
});
