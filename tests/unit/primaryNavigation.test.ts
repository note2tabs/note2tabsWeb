import { describe, expect, it } from "vitest";
import {
  ADMIN_NAV_ITEMS,
  isPrimaryNavSectionActive,
  shouldShowPremiumNav,
} from "../../components/NavBar";

describe("primary navigation active states", () => {
  it("marks each product section active across its routes", () => {
    expect(isPrimaryNavSectionActive("/home", "home")).toBe(true);
    expect(isPrimaryNavSectionActive("/editor", "editor")).toBe(true);
    expect(isPrimaryNavSectionActive("/gte/editor-1", "editor")).toBe(true);
    expect(isPrimaryNavSectionActive("/transcribe", "transcriber")).toBe(true);
    expect(isPrimaryNavSectionActive("/transcriber", "transcriber")).toBe(true);
    expect(isPrimaryNavSectionActive("/job/job-1", "transcriber")).toBe(true);
    expect(isPrimaryNavSectionActive("/pricing", "premium")).toBe(true);
  });

  it("lists every admin workspace in the account menu", () => {
    expect(ADMIN_NAV_ITEMS).toEqual([
      { href: "/admin/analytics", label: "Analytics" },
      { href: "/admin/affiliates", label: "Affiliates & coupons" },
      { href: "/admin/blog", label: "Blog" },
      { href: "/mod/users", label: "Users" },
      { href: "/mod/dashboard", label: "Moderation" },
    ]);
  });

  it("does not mark unrelated sections active", () => {
    expect(isPrimaryNavSectionActive("/home", "editor")).toBe(false);
    expect(isPrimaryNavSectionActive("/settings", "premium")).toBe(false);
  });

  it("removes pricing from the header for Premium accounts", () => {
    expect(shouldShowPremiumNav("authenticated", true, true)).toBe(false);
    expect(shouldShowPremiumNav("authenticated", true, false)).toBe(true);
    expect(shouldShowPremiumNav("unauthenticated", false, false)).toBe(true);
    expect(shouldShowPremiumNav("loading", false, false)).toBe(false);
  });
});
