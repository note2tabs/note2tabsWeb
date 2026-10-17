import { accountEmailLocale } from "./i18n/accountLanguage";
import { createPostHogServerClient } from "./posthogServer";
import { emailLanguageProblems, EmailLanguageMismatchError, type EmailLanguage } from "./emailLanguage";
import { SendEmailCommand, SESClient } from "@aws-sdk/client-ses";
import nodemailer from "nodemailer9";

type SendEmailInput = {
  language: EmailLanguage;
  to: string;
  subject: string;
  html: string;
  text?: string;
  analyticsCategory?: string;
};

export class EmailConfigurationError extends Error {
  constructor() {
    super(
      "Email delivery is not configured. Set SES_SMTP_USERNAME, SES_SMTP_PASSWORD, SES_SMTP_HOST, SES_SMTP_PORT, and EMAIL_FROM."
    );
    this.name = "EmailConfigurationError";
  }
}

let sesClient: SESClient | null = null;
let sesClientRegion = "";
let sesClientKey = "";
let smtpTransporter: nodemailer.Transporter | null = null;
let smtpTransportKey = "";

function getFromAddress() {
  return process.env.EMAIL_FROM || process.env.AWS_SES_FROM || "Note2Tabs <no-reply@note2tabs.com>";
}

function getSesRegion() {
  return process.env.AWS_SES_REGION || process.env.AWS_REGION || process.env.SES_SMTP_REGION || "";
}

function getSesSmtpHost() {
  return process.env.SES_SMTP_HOST || (getSesRegion() ? `email-smtp.${getSesRegion()}.amazonaws.com` : "");
}

function getSesSmtpPort() {
  const value = Number(process.env.SES_SMTP_PORT || 587);
  return Number.isFinite(value) ? value : 587;
}

function getSesSmtpCredentials() {
  const user = process.env.SES_SMTP_USERNAME || process.env.SES_SMTP_USER || "";
  const pass = process.env.SES_SMTP_PASSWORD || process.env.SES_SMTP_PASS || "";
  if (!user || !pass) return null;
  return { user, pass };
}

function getSesApiCredentials() {
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID || "";
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY || "";
  const sessionToken = process.env.AWS_SESSION_TOKEN || undefined;
  if (!accessKeyId || !secretAccessKey) return null;
  return { accessKeyId, secretAccessKey, ...(sessionToken ? { sessionToken } : {}) };
}

function getSmtpTransporter() {
  const credentials = getSesSmtpCredentials();
  const host = getSesSmtpHost();
  const port = getSesSmtpPort();
  if (!credentials || !host) return null;

  const key = `${host}:${port}:${credentials.user}`;
  if (!smtpTransporter || smtpTransportKey !== key) {
    smtpTransporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: credentials,
      disableFileAccess: true,
      disableUrlAccess: true,
    });
    smtpTransportKey = key;
  }

  return smtpTransporter;
}

function getSesClient() {
  const region = getSesRegion();
  const credentials = getSesApiCredentials();
  if (!region || !credentials) return null;

  const key = `${region}:${credentials.accessKeyId}`;
  if (!sesClient || sesClientRegion !== region || sesClientKey !== key) {
    sesClient = new SESClient({ region, credentials });
    sesClientRegion = region;
    sesClientKey = key;
  }

  return sesClient;
}

export function isEmailDeliveryConfigured() {
  return Boolean(getSmtpTransporter() || getSesClient());
}

export async function sendTransactionalEmail(input: SendEmailInput): Promise<boolean> {
  if (input.language?.kind !== "internal") {
    const language = input.language;
    let expected = language?.locale;
    let problems:string[];
    try {
      if (language?.accountId) expected = await accountEmailLocale(language.accountId, language.locale);
      problems = language?.kind === "customer" ? emailLanguageProblems(input, language, expected) : ["language_context_missing"];
    } catch { problems = ["preference_lookup_failed"]; }
    if (problems.length) {
      const error = new EmailLanguageMismatchError(problems);
      // No address, subject, user-entered title, token, link or email body in logs.
      const properties = { alert_eligible:true, error_classification:"email_language_mismatch", email_template:language?.template || "unknown",
        expected_locale:expected || "unknown", rendered_locale:language?.locale || "unknown", validation_reasons:problems, delivery_stage:"blocked_before_send",
        environment:process.env.VERCEL_ENV || process.env.NODE_ENV || "development", test_event:language?.test === true };
      console.error("email_language_mismatch", properties);
      try {
        const ph = createPostHogServerClient();
        if (ph) { await ph.captureExceptionImmediate(error, language?.accountId || "system:email-language", properties); }
      } catch { console.warn("email_language_alert_delivery_failed"); }
      throw error;
    }
  }

  const smtp = getSmtpTransporter();
  const client = getSesClient();
  const from = getFromAddress();

  if (smtp) {
    await smtp.sendMail({
      from,
      to: input.to,
      subject: input.subject,
      html: input.html,
      ...(input.text ? { text: input.text } : {}),
      ...((input.analyticsCategory || input.language.kind === "customer") ? {headers: {
        ...(input.analyticsCategory ? { "X-SES-MESSAGE-TAGS": `email_category=${input.analyticsCategory}` } : {}),
        ...(input.language.kind === "customer" ? { "Content-Language":input.language.locale, "X-Note2Tabs-Template":input.language.template } : {}),
      }} : {}),
    });
    return true;
  }

  if (client) {
    await client.send(
      new SendEmailCommand({
        Source: from,
        Destination: {
          ToAddresses: [input.to],
        },
        Message: {
          Subject: {
            Charset: "UTF-8",
            Data: input.subject,
          },
          Body: {
            Html: {
              Charset: "UTF-8",
              Data: input.html,
            },
            ...(input.text
              ? {
                  Text: {
                    Charset: "UTF-8",
                    Data: input.text,
                  },
                }
              : {}),
          },
        },
        ...(input.analyticsCategory
          ? { Tags: [{ Name: "email_category", Value: input.analyticsCategory }] }
          : {}),
      })
    );
    return true;
  }

  throw new EmailConfigurationError();
}
