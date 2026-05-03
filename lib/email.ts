import { SendEmailCommand, SESClient } from "@aws-sdk/client-ses";
import nodemailer from "nodemailer";

type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  text?: string;
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
      })
    );
    return true;
  }

  throw new EmailConfigurationError();
}
