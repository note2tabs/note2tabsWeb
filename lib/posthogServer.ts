import { PostHog } from "posthog-node";

function getPostHogConfig() {
  const token =
    process.env.POSTHOG_PROJECT_TOKEN ||
    process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
  const host =
    process.env.POSTHOG_HOST ||
    process.env.NEXT_PUBLIC_POSTHOG_HOST ||
    "https://eu.i.posthog.com";

  return { token, host };
}

export function isPostHogConfigured() {
  return Boolean(getPostHogConfig().token);
}

export function createPostHogServerClient() {
  const { token, host } = getPostHogConfig();
  if (!token) return null;

  return new PostHog(token, {
    host,
    flushAt: 1,
    flushInterval: 0,
    disableGeoip: false,
  });
}

