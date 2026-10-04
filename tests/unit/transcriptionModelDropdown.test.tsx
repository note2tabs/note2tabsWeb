import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import TranscriptionModelDropdown from "../../components/TranscriptionModelDropdown";

describe("TranscriptionModelDropdown Heavy access", () => {
  it("presents the verified free-account Heavy entitlement as a one-time preview", () => {
    const html = renderToStaticMarkup(
      <TranscriptionModelDropdown
        value="super_heavy"
        onChange={vi.fn()}
        canUseHeavy
        heavyPreviewAvailable
      />
    );

    expect(html).toContain("One free preview");
    expect(html).not.toContain("disabled=\"\"");
  });

  it("keeps Heavy visible but locked until verification", () => {
    const html = renderToStaticMarkup(
      <TranscriptionModelDropdown
        value="light"
        onChange={vi.fn()}
        verificationRequired
      />
    );

    expect(html).toContain("Verify to unlock");
    expect(html).toContain("Verify your email to unlock one free Heavy preview");
    expect(html).toContain("disabled=\"\"");
  });

  it("shows the subscription requirement after the preview is consumed", () => {
    const html = renderToStaticMarkup(
      <TranscriptionModelDropdown value="light" onChange={vi.fn()} />
    );

    expect(html).toContain("Premium or Pro");
  });
});
