import { PostHog } from "posthog-node";

let sharedClient: PostHog | null = null;
let sharedClientKey: string | null = null;

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

  const clientKey = `${token}:${host}`;
  if (sharedClient && sharedClientKey === clientKey) return sharedClient;

  sharedClient = new PostHog(token, {
    host,
    flushAt: 1,
    flushInterval: 0,
    disableGeoip: false,
  });
  sharedClientKey = clientKey;
  return sharedClient;
}

export function flushPostHogServerClientInBackground(
  client: Pick<PostHog, "flush">
) {
  void client.flush().catch(() => {
    // Product requests must not fail or wait because analytics is unavailable.
  });
}
