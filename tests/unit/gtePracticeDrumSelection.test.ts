import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

const page = readFileSync("pages/gte/[editor_id].tsx", "utf8");
const start = page.indexOf("const globalControlsLaneId = useMemo(");
const end = page.indexOf("const activeEditableLaneId", start);
const select = new Function("canvas", "mobileEditLaneId", "practiceModeEnabled", "activeLaneId", "isDrumLane", "isChordLane", "useMemo",
  page.slice(start, end) + "; return globalControlsLaneId;");
const drum = { id: "drums", editorType: "drums" };
const guitar = { id: "guitar", editorType: "tab" };
const resolve = (editors: typeof drum[], active: string | null, practice = true) => select({ editors }, null, practice, active,
  (lane: typeof drum) => lane.editorType === "drums", (lane: typeof drum) => lane.editorType === "chords", (factory: () => unknown) => factory());

it("allows selecting drums for Practice, including drum-only songs", () => {
  expect(resolve([guitar, drum], "drums")).toBe("drums");
  expect(resolve([drum], null)).toBe("drums");
  expect(resolve([guitar, drum], "guitar")).toBe("guitar");
  expect(resolve([guitar, drum], "drums", false)).toBe("guitar");
  expect(page).not.toContain("disabled={candidateIsDrum}");
  expect(page).not.toContain("if (candidateIsDrum) return;");
  expect(page).not.toContain("Drum tracks can't be viewed in practice mode");
});
