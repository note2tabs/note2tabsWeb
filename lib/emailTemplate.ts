type EmailAction = {
  label: string;
  url: string;
};

type ProductEmailInput = {
  title: string;
  preview: string;
  greeting?: string;
  bodyHtml: string;
  action?: EmailAction;
  secondaryHtml?: string;
  footerHtml?: string;
};

export function escapeEmailHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Deliberately simple, table-based transactional email shell. It avoids
 * decorative product-UI replicas and remote imagery so it remains natural,
 * legible, and dependable in Gmail, Outlook, and Apple Mail.
 */
export function renderProductEmail(input: ProductEmailInput) {
  const greeting = input.greeting ? `<p style="margin:0 0 24px;">${input.greeting}</p>` : "";
  const action = input.action
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0 0;"><tr><td bgcolor="#101714" style="border-radius:9px;"><a href="${input.action.url}" style="display:inline-block;padding:13px 18px;color:#fdfdfb;text-decoration:none;font-size:15px;line-height:20px;font-weight:700;">${escapeEmailHtml(input.action.label)}</a></td></tr></table>`
    : "";

  return `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:0;background:#f5f2eb;color:#17201d;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeEmailHtml(input.preview)}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;background:#f5f2eb;font-family:Arial,Helvetica,sans-serif;">
      <tr><td align="center" style="padding:36px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;">
          <tr><td style="padding:0 2px 20px;color:#101714;font-size:20px;font-weight:700;letter-spacing:-0.35px;"><img src="https://www.note2tabs.com/logo-mark-96.png" width="30" height="30" alt="" style="display:inline-block;width:30px;height:30px;margin:0 10px 0 0;border:0;vertical-align:middle;"><span style="vertical-align:middle;">Note2Tabs</span></td></tr>
          <tr><td style="background:#fdfdfb;border:1px solid #dfddd5;border-radius:16px;padding:36px 28px;font-size:16px;line-height:1.6;">
            ${greeting}
            <h1 style="margin:0 0 16px;color:#101714;font-size:28px;line-height:1.22;letter-spacing:-0.55px;font-weight:700;">${escapeEmailHtml(input.title)}</h1>
            <div style="color:#56605c;">${input.bodyHtml}</div>
            ${action}
            ${input.secondaryHtml ? `<div style="margin-top:24px;color:#747d79;font-size:13px;line-height:1.55;">${input.secondaryHtml}</div>` : ""}
          </td></tr>
          <tr><td style="padding:18px 2px 0;color:#858c89;font-size:12px;line-height:1.5;">${input.footerHtml || "Note2Tabs"}</td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}
