type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  text?: string;
};

function getFromAddress() {
  return process.env.EMAIL_FROM || process.env.RESEND_FROM || "Note2Tabs <onboarding@resend.dev>";
}

export async function sendTransactionalEmail(input: SendEmailInput): Promise<boolean> {
  const resendApiKey = process.env.RESEND_API_KEY || process.env.RESEND_KEY;
  const from = getFromAddress();

  if (resendApiKey) {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [input.to],
        subject: input.subject,
        html: input.html,
        ...(input.text ? { text: input.text } : {}),
      }),
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Resend send failed (${response.status}): ${body || "Unknown error"}`);
    }
    return true;
  }

  console.warn("[email] RESEND_API_KEY missing. Email delivery is disabled.");
  console.log("[email fallback]", {
    to: input.to,
    subject: input.subject,
    preview: input.text || input.html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
  });
  return false;
}
