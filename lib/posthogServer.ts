import { waitUntil } from "@vercel/functions";
import { enqueuePostHogCaptures, retryPostHogCaptures } from "./posthogOutbox";
import { sanitizeAnalyticsProperties } from "./analyticsPrivacy";
import { PostHog } from "posthog-node";
import { createHash } from "crypto";

let sharedClient: PostHog | null = null;
let sharedClientKey: string | null = null;

/**
 * PostHog deduplicates retried captures by their top-level event UUID. Derive
 * one from a stable business identifier so a retried webhook or API request
 * cannot inflate low-volume conversion events.
 */
export function stablePostHogEventUuid(identifier: string) {
  const hex = createHash("sha256").update(identifier).digest("hex").slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20)}`;
}

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

  const sdk = new PostHog(token, {
    host,
    flushAt: 1,
    flushInterval: 0,
    disableGeoip: false,
  });
  const pending: Array<Record<string, unknown> & {uuid: string}> = [];
  sharedClient = new Proxy(sdk, {
    get(target, key) {
      if (key === "capture") return (message: Parameters<PostHog["capture"]>[0]) => {
        const insertId = message.properties?.$insert_id;
        const uuid = message.uuid || (typeof insertId === "string" ? stablePostHogEventUuid(`${message.event}:${insertId}`) : globalThis.crypto.randomUUID());
        pending.push({uuid, event: message.event, distinct_id: message.distinctId,
          timestamp: (message.timestamp || new Date()).toISOString(),
          properties: sanitizeAnalyticsProperties({...message.properties, environment: process.env.VERCEL_ENV || process.env.NODE_ENV || "development",
            $insert_id: typeof insertId === "string" ? insertId : uuid, $geoip_disable: message.disableGeoip ?? true, ...(message.distinctId?.startsWith("system:") ? {$process_person_profile:false} : {})})});
      };
      if (key === "flush") return async () => {
        const batch = pending.splice(0);
        try { await enqueuePostHogCaptures(batch, sendPostHogBatch); }
        catch (error) { pending.unshift(...batch); throw error; }
        // Identity linking and SDK feature-flag internals retain SDK semantics.
        await target.flush();
      };
      const value = Reflect.get(target, key, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  sharedClientKey = clientKey;
  return sharedClient;
}

export function flushPostHogServerClientInBackground(
  client: Pick<PostHog, "flush">
) {
  const delivery = client.flush().catch(() => {
    console.warn("posthog_business_enqueue_failed");
    // A database failure leaves this batch in process memory for another flush.
  });
  // waitUntil keeps the database enqueue alive after the product response.
  try { waitUntil(delivery); } catch { /* local execution */ }
}

async function sendPostHogBatch(batch: Array<Record<string, unknown> & {uuid: string}>) {
  const {token, host} = getPostHogConfig();
  if (!token) throw new Error("PostHog is not configured");
  const response = await fetch(`${host.replace(/\/$/, "")}/batch/`, {
    method:"POST", headers:{"Content-Type":"application/json"},
    body:JSON.stringify({api_key:token,batch}), signal:AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error("PostHog batch delivery failed");
}
export async function retryServerPostHogCaptures() {
  if (!getPostHogConfig().token) return 0;
  return retryPostHogCaptures(sendPostHogBatch);
}
