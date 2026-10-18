import { describe, expect, it } from "vitest";
import { isInsideTabGrid } from "../../lib/gteTabGridHitTest";

describe("tab grid hit testing", () => {
  const hit = (x: number, y: number) => isInsideTabGrid(x, y, 160, 120, 3, (row) => row === 2 ? 400 : 800);
  it("accepts string cells in each row", () => {
    expect(hit(0, 0)).toBe(true);
    expect(hit(799, 119)).toBe(true);
    expect(hit(300, 330)).toBe(true);
  });
  it("rejects space beside short rows, row gutters, and outer whitespace", () => {
    for (const [x, y] of [[500, 330], [800, 30], [10, 120], [10, 159], [10, 440], [-1, 10], [10, -1], [10, 480]]) {
      expect(hit(x, y)).toBe(false);
    }
  });
});
