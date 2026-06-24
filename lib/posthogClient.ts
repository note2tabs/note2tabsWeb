import posthog from "posthog-js";

const CONSENT_COOKIE = "analytics_consent";
let initialized = false;

function getCookie(name: string) {
  if (typeof document === "undefined") return undefined;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : undefined;
}

export function initPostHog() {
  if (initialized || typeof window === "undefined") return posthog;

  const token = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
  if (!token) return posthog;

  posthog.init(token, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://eu.i.posthog.com",
    defaults: "2026-05-30",
    capture_pageview: false,
    capture_pageleave: true,
    autocapture: true,
    person_profiles: "identified_only",
    disable_session_recording:
      process.env.NEXT_PUBLIC_POSTHOG_SESSION_RECORDING !== "true",
    opt_out_capturing_by_default: getCookie(CONSENT_COOKIE) === "denied",
    persistence: "localStorage+cookie",
  });

  initialized = true;
  return posthog;
}

export function getPostHog() {
  return initPostHog();
}

export function setPostHogConsent(state: "granted" | "denied") {
  const client = initPostHog();
  if (!process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN) return;

  if (state === "granted") {
    client.opt_in_capturing();
  } else {
    client.opt_out_capturing();
    client.reset();
  }
}

