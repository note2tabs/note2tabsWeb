import { describe, expect, it } from "vitest";
import { buildInternshipApplicationEmail, INTERNSHIP_APPLICATION_LIMITS, validateInternshipApplication } from "../../lib/internshipApplication";

const now = 10_000;
const valid = { email: "student@example.com", program: "Computer Science", studyYear: "Third year", presentation: "I build accessible music tools.", portfolio: "https://example.com", linkedIn: "https://linkedin.com/in/student", company: "", startedAt: 1_000 };

describe("internship application", () => {
  it("accepts and normalizes a valid application", () => {
    const result = validateInternshipApplication({ ...valid, program: "  Computer Science  " }, now);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.application.program).toBe("Computer Science");
  });

  it.each(["email", "program", "studyYear", "presentation"])("requires %s", (field) => {
    expect(validateInternshipApplication({ ...valid, [field]: "" }, now).ok).toBe(false);
  });

  it("rejects malformed email and LinkedIn URLs", () => {
    expect(validateInternshipApplication({ ...valid, email: "not-an-email" }, now).ok).toBe(false);
    expect(validateInternshipApplication({ ...valid, linkedIn: "javascript:alert(1)" }, now).ok).toBe(false);
  });

  it("rejects oversized fields", () => {
    expect(validateInternshipApplication({ ...valid, presentation: "x".repeat(INTERNSHIP_APPLICATION_LIMITS.presentation + 1) }, now).ok).toBe(false);
  });

  it("rejects honeypots and implausibly fast submissions", () => {
    expect(validateInternshipApplication({ ...valid, company: "Spam Corp" }, now).ok).toBe(false);
    expect(validateInternshipApplication({ ...valid, startedAt: now - 100 }, now).ok).toBe(false);
  });

  it("escapes all user content in the HTML email", () => {
    const result = validateInternshipApplication({ ...valid, presentation: "<script>alert('x')</script>" }, now);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const email = buildInternshipApplicationEmail(result.application);
    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("&lt;script&gt;");
    expect(email.text).toContain("<script>alert('x')</script>");
  });

  it("does not allow line breaks in the email subject", () => {
    const email = buildInternshipApplicationEmail({
      email: "student@example.com",
      program: "Computer Science\r\nInjected header",
      studyYear: "Third year",
      presentation: "Hello",
      portfolio: "",
      linkedIn: "",
    });
    expect(email.subject).toBe("Internship application — Computer Science Injected header");
  });
});
