// @vitest-environment jsdom
import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
const m = vi.hoisted(() => ({
  session: { data: { user: { id: "test" } }, status: "authenticated" } as any,
  send: vi.fn(),
  signIn: vi.fn(),
  fetch: vi.fn(),
  remember: vi.fn(),
}));
vi.mock("next-auth/react", () => ({ useSession: () => m.session }));
vi.mock("../../lib/i18n/auth", () => ({ localizedSignIn: m.signIn }));
vi.mock("../../lib/i18n/react", () => ({
  useLocale: () => ({
    locale: "en",
    href: (s: string) => s,
    t: (s: string, p: Record<string, unknown> = {}) =>
      s.replace(/\{(\w+)\}/g, (_, k) => String(p[k] ?? "")),
  }),
}));
vi.mock("../../lib/useDisplayCurrency", () => ({
  useDisplayCurrency: () => "USD",
  usePricingMarket: () => "standard",
}));
vi.mock("../../lib/analytics", () => ({
  ANALYTICS_EVENTS: {
    premiumPromptEligible: "eligible",
    premiumPromptRendered: "rendered",
    premiumPromptShown: "shown",
    premiumPromptViewed: "viewed",
    premiumPromptClicked: "clicked",
    premiumPromptDismissed: "dismissed",
    checkoutClientFailed: "failed",
  },
  sendEvent: m.send,
}));
vi.mock("../../lib/checkoutTracking", () => ({
  rememberCheckoutAttempt: m.remember,
}));
vi.mock("../../components/LocaleLink", () => ({
  default: ({ children, ...props }: any) =>
    React.createElement("a", props, children),
}));
import Prompt from "../../components/LimitUpgradePrompt";
let root: Root, el: HTMLDivElement;
const tracking = {
  source: "low_credits" as const,
  reason: "credits_exhausted",
  surface: "test",
  trigger: "test",
};
async function render(context: any, extra: any = {}) {
  await act(async () =>
    root.render(React.createElement(Prompt, { context, tracking, ...extra })),
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  m.fetch.mockReset().mockResolvedValue({ ok: false, json: async () => ({}) });
  m.session = { data: { user: { id: "test" } }, status: "authenticated" };
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.stubGlobal("fetch", m.fetch);
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
  el = document.createElement("div");
  document.body.append(el);
  root = createRoot(el);
});
afterEach(async () => {
  await act(async () => root.unmount());
  el.remove();
  vi.unstubAllGlobals();
});
it("shows actual missing credits, the price, benefits, and no cross", async () => {
  await render({ plan: "FREE", remaining: 1, required: 3 });
  expect(el.textContent).toContain(
    "This transcription needs 3 credits. You have 1 left.",
  );
  expect(el.textContent).toContain("$5.99");
  expect(el.querySelector('[aria-label="Close upgrade popup"]')).toBeNull();
  expect(el.querySelector("dialog")?.open).toBe(true);
});
it("dismisses without a request or standalone upgrade button", async () => {
  await render({ plan: "FREE", remaining: 0 });
  await act(async () =>
    el.querySelector<HTMLButtonElement>(".limit-upgrade-back")!.click(),
  );
  expect(el.querySelector("dialog")?.open).toBe(false);
  expect(m.fetch).not.toHaveBeenCalled();
  expect(el.querySelector("button:not(dialog button)")).toBeNull();
});
it("keeps positive low credits nonblocking", async () => {
  await render(
    { plan: "FREE", remaining: 3, required: 2 },
    { tracking: { ...tracking, reason: "credits_low" } },
  );
  expect(el.querySelector("dialog")?.open).toBe(false);
  expect(m.send).not.toHaveBeenCalled();
});
it("preserves selection before checkout, sends the selected plan and blocks concurrent clicks", async () => {
  const before = vi.fn().mockResolvedValue(undefined);
  m.fetch.mockResolvedValue({ ok: false, json: async () => ({}) });
  await render(
    { plan: "FREE", fileBytes: 320 * 1024 * 1024, beforeCheckout: before },
    { tracking: { ...tracking, reason: "pro_file_size_limit" } },
  );
  await act(async () => {
    const button = el.querySelector<HTMLButtonElement>(
      ".limit-upgrade-primary",
    )!;
    button.click();
    button.click();
  });
  expect(before).toHaveBeenCalledTimes(1);
  expect(m.fetch).toHaveBeenCalledTimes(1);
  expect(JSON.parse(m.fetch.mock.calls[0][1].body)).toMatchObject({
    plan: "pro",
    billingInterval: "monthly",
    returnTo: "/transcribe?resumeTranscription=1",
  });
  expect(el.querySelector('[role="alert"]')).not.toBeNull();
  expect(el.querySelector("dialog")?.open).toBe(true);
});
it("hands guests to login after preserving their selection", async () => {
  m.session = { data: null, status: "unauthenticated" };
  const before = vi.fn().mockResolvedValue(undefined);
  await render({ plan: "FREE", remaining: 0, beforeCheckout: before });
  await act(async () =>
    el.querySelector<HTMLButtonElement>(".limit-upgrade-primary")!.click(),
  );
  expect(before).toHaveBeenCalledOnce();
  expect(m.signIn).toHaveBeenCalledWith(undefined, {
    callbackUrl: expect.stringContaining("resumeTranscription=1"),
  });
  expect(m.fetch).not.toHaveBeenCalled();
});
it("does not double count an unchanged open dialog on rerender", async () => {
  await render({ plan: "FREE", remaining: 0 });
  await render({ plan: "FREE", remaining: 0 });
  expect(m.send.mock.calls.filter(([event]) => event === "shown")).toHaveLength(
    1,
  );
});
it("does not emit analytics or create a Checkout session in the preview", async () => {
  await render({ plan: "FREE", remaining: 0 }, { preview: true });
  await act(async () =>
    el.querySelector<HTMLButtonElement>(".limit-upgrade-primary")!.click(),
  );
  expect(m.fetch).not.toHaveBeenCalled();
  expect(m.send).not.toHaveBeenCalled();
});
it("preserves the selection before comparison and stays open on storage failure", async () => {
  const before = vi.fn().mockRejectedValue(Error("storage"));
  await render({ plan: "FREE", remaining: 0, beforeCheckout: before });
  await act(async () =>
    el.querySelector<HTMLAnchorElement>(".limit-upgrade-compare")!.click(),
  );
  expect(before).toHaveBeenCalledOnce();
  expect(el.querySelector('[role="alert"]')?.textContent).toContain(
    "Could not save your selection",
  );
  expect(m.fetch).not.toHaveBeenCalled();
});
it("reopens on a new blocked attempt after dismissal", async () => {
  await render({ plan: "FREE", remaining: 0, attempt: 1 });
  await act(async () =>
    el.querySelector<HTMLButtonElement>(".limit-upgrade-back")!.click(),
  );
  await render({ plan: "FREE", remaining: 0, attempt: 2 });
  expect(el.querySelector("dialog")?.open).toBe(true);
});

it("shows the subscriber's credit-based price and confirms the existing subscription", async () => {
  const quote = { id: "quote_1", currency: "usd", credits: 200, discount: 1198, regularAmount: 1499, dueNow: 301 };
  m.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ quote }) });
  const before = vi.fn().mockResolvedValue(undefined);
  await render({ plan: "PREMIUM", remaining: 200, fileBytes: 350 * 1024 * 1024, beforeCheckout: before }, { tracking: { ...tracking, reason: "file_size_limit" } });
  expect(el.textContent).toContain("Then $14.99/month");
  expect(el.textContent).toContain("200 credits exchanged · $11.98 off your first month");
  expect(el.querySelector(".limit-upgrade-primary")?.textContent).toContain("Upgrade to Pro — $3.01");
  expect(JSON.parse(m.fetch.mock.calls[0][1].body)).toMatchObject({ action: "quote" });
  await act(async () => el.querySelector<HTMLButtonElement>(".limit-upgrade-primary")!.click());
  expect(before).toHaveBeenCalledOnce();
  expect(m.fetch.mock.calls.every(([url]) => url === "/api/stripe/change-plan")).toBe(true);
  expect(m.fetch.mock.calls.some(([,options]) => {
    const body = JSON.parse(options.body);
    return body.action === "confirm" && body.quoteId === "quote_1" && body.plan === "pro";
  })).toBe(true);
});
it("attaches the same explicit limit type to shown, clicked and dismissed events", async () => {
  m.fetch.mockResolvedValue({ok:false,json:async()=>({})});
  await render({plan:"FREE",fileBytes:60*1024*1024},{tracking:{...tracking,reason:"file_size_limit"}});
  expect(m.send.mock.calls.find(([event])=>event==="shown")?.[1]).toMatchObject({limit_type:"file_size",current_plan:"free",popup_version:"priced_limit_v2",upload_limit_bytes:50*1024*1024});
  await act(async()=>el.querySelector<HTMLButtonElement>(".limit-upgrade-primary")!.click());
  expect(m.send.mock.calls.find(([event])=>event==="clicked")?.[1]).toMatchObject({limit_type:"file_size",cta:"start_checkout"});
  await act(async()=>el.querySelector<HTMLButtonElement>(".limit-upgrade-back")!.click());
  expect(m.send.mock.calls.find(([event])=>event==="dismissed")?.[1]).toMatchObject({limit_type:"file_size",dismiss_method:"back_to_transcriber"});
});
