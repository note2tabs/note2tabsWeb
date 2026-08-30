import { describe, expect, it } from "vitest";
import {
  PREMIUM_PAYMENT_GRACE_DAYS,
  buildPaymentFailedEmail,
  paymentRecoveryExpired,
} from "../../lib/paymentRecovery";

describe("payment recovery", () => {
  it("keeps access inside the recovery window and expires it at 14 days", () => {
    const now = new Date("2026-08-30T12:00:00.000Z");
    expect(paymentRecoveryExpired(new Date("2026-08-16T12:00:01.000Z"), now)).toBe(false);
    expect(paymentRecoveryExpired(new Date("2026-08-16T12:00:00.000Z"), now)).toBe(true);
    expect(PREMIUM_PAYMENT_GRACE_DAYS).toBe(14);
  });

  it("links users to billing settings without exposing payment details", () => {
    const email = buildPaymentFailedEmail({ name: "Noel <script>" });
    expect(email.subject).toContain("update");
    expect(email.text).toContain("/settings?billing=payment_failed");
    expect(email.html).not.toContain("Noel <script>");
  });
});
