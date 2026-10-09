import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("pages/gte/index.tsx", "utf8");
const styles = readFileSync("styles/globals.css", "utf8");

describe("editor library row interaction", () => {
  it("makes the complete editor row a labelled link", () => {
    expect(source).toContain('className="gte-library-row-link"');
    expect(source).toContain('aria-label={t("Open {value1}", {value1: editorName(editor.name, t) || t("Untitled tab")})}');
    expect(styles).toMatch(/\.gte-library-row-link \{[\s\S]*position: absolute;[\s\S]*inset: 0;/);
  });

  it("keeps the row menu above the full-row link", () => {
    expect(source).toContain('data-editor-row-menu="true"');
    expect(styles).toMatch(/\.gte-library-row-menu \{[\s\S]*z-index: 2;/);
  });
});
