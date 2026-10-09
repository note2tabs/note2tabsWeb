import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import PostLightModelPrompt from "../../components/PostLightModelPrompt";

const renderPrompt = (recommendation: "heavy" | "heavy_preview", open = true, hasHeavyAccess = false) =>
  renderToStaticMarkup(
    createElement(PostLightModelPrompt, {
      open,
      recommendation,
      hasHeavyAccess,
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

  it("offers paid Heavy access without promising another free preview", () => {
    const html = renderPrompt("heavy");

    expect(html).toContain("Get better accuracy!");
    expect(html).toContain("See Heavy plans");
    expect(html).not.toContain("Medium");
    expect(html).not.toContain("free 30-second preview");
  });

  it("lets subscribed users retry with Heavy", () => {
    expect(renderPrompt("heavy", true, true)).toContain("Try Heavy");
    expect(renderPrompt("heavy", true, true)).not.toContain("See Heavy plans");
  });

  it("renders nothing while closed", () => {
    expect(renderPrompt("heavy", false)).toBe("");
  });
});
