import { describe, expect, it } from "vitest";
import { escapeEmailHtml, renderProductEmail } from "../../lib/emailTemplate";

describe("product email template", () => {
  it("uses the real logo, one clear heading, and email-safe table layout", () => {
    const html = renderProductEmail({
      title: "A useful update",
      preview: "Short preview",
      greeting: "Hi there,",
      bodyHtml: '<p style="margin:0;">The message.</p>',
      action: { label: "Continue", url: "https://www.note2tabs.com/home" },
    });

    expect(html).toContain('src="https://www.note2tabs.com/logo-mark-96.png"');
    expect(html).toContain('alt=""');
    expect(html).toContain('<h1');
    expect(html).toContain('role="presentation"');
    expect(html).toContain('href="https://www.note2tabs.com/home"');
    expect(html).not.toContain("box-shadow");
    expect(html).not.toContain("text-transform:uppercase");
  });

  it("escapes text placed in structural template fields", () => {
    const html = renderProductEmail({
      title: "<script>title</script>",
      preview: "<preview>",
      bodyHtml: "Safe body",
    });

    expect(html).not.toContain("<script>title</script>");
    expect(html).toContain("&lt;script&gt;title&lt;/script&gt;");
    expect(escapeEmailHtml("A&B")).toBe("A&amp;B");
  });
});
