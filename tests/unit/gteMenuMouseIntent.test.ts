import { describe, expect, it } from "vitest";
import { insideMenuBounds, insideMenuCorridor } from "../../lib/gteMenuMouseIntent";

describe("menu mouse corridors", () => {
  const panel = { left: 100, right: 300, top: 100, bottom: 300 };
  it("allows diagonal movement toward a dropdown, but not away from it", () => {
    const origin = { x: 120, y: 50 };
    expect(insideMenuCorridor({ x: 170, y: 80 }, origin, panel)).toBe(true);
    expect(insideMenuCorridor({ x: 50, y: 80 }, origin, panel)).toBe(false);
    expect(insideMenuCorridor({ x: 120, y: 20 }, origin, panel)).toBe(false);
  });
  it("supports side submenus and menus opening upward", () => {
    expect(insideMenuCorridor({ x: 80, y: 170 }, { x: 50, y: 150 }, panel)).toBe(true);
    expect(insideMenuCorridor({ x: 20, y: 150 }, { x: 50, y: 150 }, panel)).toBe(false);
    expect(insideMenuCorridor({ x: 200, y: 330 }, { x: 150, y: 350 }, panel)).toBe(true);
    expect(insideMenuCorridor({ x: 330, y: 200 }, { x: 350, y: 150 }, panel)).toBe(true);
  });
  it("recognizes entering the actual menu and tolerates slight movement at the origin", () => {
    expect(insideMenuBounds({ x: 200, y: 200 }, panel)).toBe(true);
    expect(insideMenuBounds({ x: 99, y: 200 }, panel)).toBe(false);
    expect(insideMenuCorridor({ x: 124, y: 53 }, { x: 120, y: 50 }, panel)).toBe(true);
  });
});
