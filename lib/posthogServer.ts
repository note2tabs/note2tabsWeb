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

type IngestCapture = {
  distinctId: string;
  event: string;
  uuid: string;
  timestamp: Date;
  properties: Record<string, unknown>;
  disableGeoip?: boolean;
};

// The batch API without sent_at preserves the exact event timestamp. SDK clock
// skew correction changes retry timestamps and defeats PostHog deduplication.
export function createPostHogIngestClient() {
  const { token, host } = getPostHogConfig();
  if (!token) return null;
  const batch: Array<Record<string, unknown>> = [];
  return {
    capture(event: IngestCapture) {
      batch.push({
        event: event.event, distinct_id: event.distinctId, uuid: event.uuid,
        timestamp: event.timestamp.toISOString(),
        properties: {
          ...event.properties,
          $lib: "note2tabs_server_proxy",
          ...(event.disableGeoip ? { $geoip_disable: true } : {}),
        },
      });
    },
    async flush() {
      if (!batch.length) return;
      const response = await fetch(`${host.replace(/\/$/, "")}/batch/`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ api_key: token, batch }),
        signal: AbortSignal.timeout(8_000),
      });
      if (!response.ok) throw new Error("PostHog batch delivery failed");
      batch.length = 0;
    },
  };
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
