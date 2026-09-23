import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const pageSource = fs.readFileSync(
  path.join(process.cwd(), "pages/admin/affiliates.tsx"),
  "utf8"
);

describe("affiliate admin coupon visibility", () => {
  it("shows whether each general promotion requires a card", () => {
    expect(pageSource).toContain("<th>Checkout</th>");
    expect(pageSource).toContain('promotion.cardFreeSchoolAccess ? "Card-free" : "Card required"');
  });

  it("shows affiliate coupon codes in a dedicated column", () => {
    expect(pageSource).toContain("<th>Coupon code</th>");
    expect(pageSource).toContain('className="adminAffiliateCouponCode"');
  });
});
