import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { EDITOR_TUTORIAL_CARDS } from "../../lib/editorTutorial";

describe("editor tutorial", () => {
  it("starts with four editable image-and-text cards", () => {
    expect(EDITOR_TUTORIAL_CARDS).toHaveLength(4);
    expect(EDITOR_TUTORIAL_CARDS.every((card) => card.imageSrc && card.imageAlt && card.text)).toBe(true);
    expect(new Set(EDITOR_TUTORIAL_CARDS.map((card) => card.id)).size).toBe(4);
    EDITOR_TUTORIAL_CARDS.forEach((card) => {
      expect(fs.existsSync(path.join(process.cwd(), "public", card.imageSrc))).toBe(true);
    });
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
