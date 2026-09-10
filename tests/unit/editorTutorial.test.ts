import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { EDITOR_TUTORIAL_CARDS } from "../../lib/editorTutorial";

describe("editor tutorial", () => {
  it("starts with five editable media-and-text cards", () => {
    expect(EDITOR_TUTORIAL_CARDS).toHaveLength(5);
    expect(EDITOR_TUTORIAL_CARDS.every((card) => card.mediaSrc && card.mediaAlt && card.text)).toBe(true);
    expect(new Set(EDITOR_TUTORIAL_CARDS.map((card) => card.id)).size).toBe(5);
    EDITOR_TUTORIAL_CARDS.forEach((card) => {
      expect(fs.existsSync(path.join(process.cwd(), "public", card.mediaSrc))).toBe(true);
    });
    expect(EDITOR_TUTORIAL_CARDS[0].mediaType).toBe("video");
    expect(EDITOR_TUTORIAL_CARDS[0].mediaSrc).toBe("/videos/tutorials/tutvid01.mp4");
  });

  it("connects first-entry state, every navigation control, and the reopen button", () => {
    const component = fs.readFileSync(path.join(process.cwd(), "components/EditorTutorial.tsx"), "utf8");
    expect(component).toContain("if (!passedTutorial && !guestAlreadyInteracted) setOpen(true)");
    expect(component).toContain('fetch("/api/account/tutorial"');
    expect(component).toContain('aria-label="Open editor tutorial"');
    expect(component).toContain("recordInteraction();");
    expect(component).toContain("cards.map");
  });
});
