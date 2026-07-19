import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

class MemoryStorage implements Storage {
  private values = new Map<string, string>();

  get length() {
    return this.values.size;
  }

  clear() {
    this.values.clear();
  }

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  key(index: number) {
    return Array.from(this.values.keys())[index] ?? null;
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  setItem(key: string, value: string) {
    this.values.set(key, String(value));
  }
}

function installBrowserGlobals(consent: "granted" | "denied" | "missing" = "granted") {
  const localStorage = new MemoryStorage();
  const sessionStorage = new MemoryStorage();
  const windowMock = {
    localStorage,
    sessionStorage,
    setTimeout: vi.fn(() => 1),
    clearTimeout: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(() => true),
  };

  vi.stubGlobal("window", windowMock);
  vi.stubGlobal("document", {
    cookie: consent === "missing" ? "" : `analytics_consent=${consent}`,
  });
  vi.stubGlobal(
    "CustomEvent",
    class CustomEventMock {
      constructor(public type: string, public init?: CustomEventInit) {}
    }
  );

  return { localStorage, sessionStorage, windowMock };
}

function createPostHogMock() {
  return {
    init: vi.fn(),
    capture: vi.fn(),
    identify: vi.fn(),
    reset: vi.fn(),
    opt_in_capturing: vi.fn(),
    opt_out_capturing: vi.fn(),
  };
}

describe("PostHog client identity lifecycle", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN = "phc_test";
  });

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
    vi.unstubAllGlobals();
    vi.doUnmock("posthog-js");
  });

  it("resets an identified user before anonymous activity continues", async () => {
    const { localStorage } = installBrowserGlobals();
    const posthog = createPostHogMock();
    vi.doMock("posthog-js", () => ({ default: posthog }));
    const analytics = await import("../../lib/posthogClient");

    analytics.identifyPostHogUser("user-a", { plan: "FREE" });
    await analytics.initPostHog();

    expect(posthog.identify).toHaveBeenCalledWith("user-a", { plan: "free" });
    expect(analytics.getPostHogIdentifiedUserId()).toBe("user-a");
    expect(localStorage.length).toBe(0);

    await analytics.resetPostHogIdentity();

    expect(posthog.reset).toHaveBeenCalledOnce();
    expect(analytics.getPostHogIdentifiedUserId()).toBeNull();
    expect(analytics.isPostHogIdentityResetPending()).toBe(false);
  });

  it("keeps denied consent authoritative after resetting PostHog", async () => {
    installBrowserGlobals("denied");
    const posthog = createPostHogMock();
    vi.doMock("posthog-js", () => ({ default: posthog }));
    const analytics = await import("../../lib/posthogClient");

    await analytics.setPostHogConsent("denied");
    analytics.capturePostHogEvent("should_not_send");
    analytics.identifyPostHogUser("user-a");

    const lastResetOrder = posthog.reset.mock.invocationCallOrder.at(-1);
    const optOutOrder = posthog.opt_out_capturing.mock.invocationCallOrder.at(-1);
    expect(lastResetOrder).toBeLessThan(optOutOrder as number);
    expect(posthog.capture).not.toHaveBeenCalled();
    expect(posthog.identify).not.toHaveBeenCalled();
  });

  it("cannot clear a loaded client's opt-out while consent remains denied", async () => {
    installBrowserGlobals("denied");
    const posthog = createPostHogMock();
    vi.doMock("posthog-js", () => ({ default: posthog }));
    const analytics = await import("../../lib/posthogClient");

    await analytics.setPostHogConsent("denied");
    const resetsAfterDenial = posthog.reset.mock.calls.length;
    await analytics.resetPostHogIdentity();
    const result = await analytics.initPostHog();

    expect(result).toBeNull();
    expect(posthog.reset).toHaveBeenCalledTimes(resetsAfterDenial);
    expect(posthog.opt_out_capturing).toHaveBeenCalledTimes(2);
  });

  it("defers an identity reset while consent is denied and applies it on the next permitted init", async () => {
    const { localStorage } = installBrowserGlobals("denied");
    const posthog = createPostHogMock();
    vi.doMock("posthog-js", () => ({ default: posthog }));
    const analytics = await import("../../lib/posthogClient");

    await analytics.resetPostHogIdentity();
    expect(posthog.init).not.toHaveBeenCalled();
    expect(analytics.isPostHogIdentityResetPending()).toBe(true);
    expect(localStorage.length).toBe(0);

    (document as { cookie: string }).cookie = "analytics_consent=granted";
    await analytics.initPostHog();

    expect(posthog.reset).toHaveBeenCalledOnce();
    expect(analytics.isPostHogIdentityResetPending()).toBe(false);
  });

  it("captures by default without persisting analytics state", async () => {
    const { localStorage, sessionStorage } = installBrowserGlobals("missing");
    const posthog = createPostHogMock();
    vi.doMock("posthog-js", () => ({ default: posthog }));
    const analytics = await import("../../lib/posthogClient");

    analytics.capturePostHogEvent("pre_consent_event", {
      $current_url: "https://note2tabs.com/auth/verify-email?token=secret",
    });
    await analytics.initPostHog();

    expect(posthog.init).toHaveBeenCalledWith(
      "phc_test",
      expect.objectContaining({ disable_persistence: true, opt_out_capturing_by_default: false })
    );
    expect(posthog.capture).toHaveBeenCalledWith("pre_consent_event", {
      $current_url: "https://note2tabs.com/auth/verify-email",
    });
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });

  it("installs a final URL and PII scrubber in PostHog", async () => {
    installBrowserGlobals("granted");
    const posthog = createPostHogMock();
    vi.doMock("posthog-js", () => ({ default: posthog }));
    const analytics = await import("../../lib/posthogClient");

    await analytics.initPostHog();
    const config = posthog.init.mock.calls[0]?.[1] as {
      before_send?: (event: any) => any;
      capture_exceptions?: boolean;
      save_referrer?: boolean;
    };
    const sanitized = config.before_send?.({
      uuid: "event-id",
      event: "$pageview",
      properties: {
        $current_url: "https://note2tabs.com/reset-password/secret?email=a@b.com",
        email: "a@b.com",
      },
    });

    expect(config.capture_exceptions).toBe(false);
    expect(config.save_referrer).toBe(false);
    expect(sanitized.properties).toEqual({
      $current_url: "https://note2tabs.com/reset-password/[token]",
    });
  });
});
