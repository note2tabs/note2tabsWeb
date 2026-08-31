import { OAuth2Client } from "google-auth-library";

const oidcClient = new OAuth2Client();

function bearerToken(authorization: string | string[] | undefined) {
  const value = Array.isArray(authorization) ? authorization[0] : authorization;
  if (!value?.startsWith("Bearer ")) return null;
  return value.slice("Bearer ".length).trim() || null;
}

type IdTokenVerifier = Pick<OAuth2Client, "verifyIdToken">;

export async function isAuthorizedSchedulerRequest(
  authorization: string | string[] | undefined,
  verifier: IdTokenVerifier = oidcClient
) {
  const token = bearerToken(authorization);
  if (!token) return false;

  // Preserve Vercel CRON_SECRET support for local checks and existing jobs.
  if (process.env.CRON_SECRET && token === process.env.CRON_SECRET) return true;

  const expectedEmail = process.env.GOOGLE_CLOUD_SCHEDULER_SERVICE_ACCOUNT;
  const audience = process.env.GOOGLE_CLOUD_SCHEDULER_AUDIENCE;
  if (!expectedEmail || !audience) return false;

  try {
    const ticket = await verifier.verifyIdToken({ idToken: token, audience });
    const payload = ticket.getPayload();
    return payload?.email === expectedEmail && payload.email_verified === true;
  } catch {
    return false;
  }
}
