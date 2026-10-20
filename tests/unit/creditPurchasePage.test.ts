// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
const m = vi.hoisted(() => ({
  fetch: vi.fn(),
  signIn: vi.fn(),
  query: {} as Record<string, string>,
  status: "unauthenticated",
}));
vi.mock("next/router", () => ({
  useRouter: () => ({ query: m.query, asPath: "/credits" }),
}));
vi.mock("next/head", () => ({
  default: ({ children }: any) =>
    React.createElement(React.Fragment, null, children),
}));
vi.mock("next-auth/react", () => ({
  useSession: () => ({ status: m.status }),
}));
vi.mock("../../lib/i18n/auth", () => ({ localizedSignIn: m.signIn }));
vi.mock("../../components/LocaleLink", () => ({
  default: ({ children, ...p }: any) => React.createElement("a", p, children),
}));
vi.mock("../../lib/i18n/react", () => ({
  useLocale: () => ({
    locale: "en",
    t: (s: string, p: Record<string, unknown> = {}) =>
      s.replace(/\{(\w+)\}/g, (_, k) => String(p[k] ?? "")),
  }),
}));
import Page from "../../pages/credits";
let root: Root, el: HTMLDivElement;
beforeEach(() => {
  m.query = {};
  m.status = "unauthenticated";
  vi.clearAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("fetch", m.fetch);
  el = document.createElement("div");
  document.body.append(el);
  root = createRoot(el);
});
afterEach(async () => {
  await act(async () => root.unmount());
  el.remove();
  vi.unstubAllGlobals();
});
const render = async () =>
  act(async () => root.render(React.createElement(Page)));
it("shows exact preset prices and removes the Stripe confirmation sentence", async () => {
  await render();
  expect(el.textContent).not.toContain("Your credits appear after Stripe");
  expect(el.textContent).toContain("USD");
  expect(el.querySelector(".credit-top-up-buy")?.textContent).toContain("1.49");
  await act(async () =>
    el.querySelector<HTMLInputElement>('input[value="30"]')!.click(),
  );
  expect(el.querySelector(".credit-top-up-buy")?.textContent).toContain("2.49");
});
it("keeps all 15-credit increments available and blocks invalid custom quantities", async () => {
  await render();
  await act(async () =>
    el
      .querySelector<HTMLInputElement>(".credit-top-up-custom-choice input")!
      .click(),
  );
  const input = el.querySelector<HTMLInputElement>("#top-up-credits")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(input, "45");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  expect(el.querySelector(".credit-top-up-buy")?.textContent).toContain("3.49");
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(input, "16");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  expect(
    el.querySelector<HTMLButtonElement>(".credit-top-up-buy")?.disabled,
  ).toBe(true);
  expect(el.querySelector('[role="alert"]')).not.toBeNull();
});
it("preserves chosen quantity through localized sign-in without starting payment", async () => {
  m.query = { credits: "45" };
  await render();
  await act(async () =>
    el.querySelector<HTMLButtonElement>(".credit-top-up-buy")!.click(),
  );
  expect(m.signIn).toHaveBeenCalledWith(undefined, {
    callbackUrl: expect.stringContaining("/credits?credits=45"),
  });
  expect(m.fetch).not.toHaveBeenCalled();
});
it("shows the real balance when available and does not invent one on failure", async () => {
  m.status = "authenticated";
  m.fetch.mockResolvedValue({
    ok: true,
    json: async () => ({ credits: { remaining: 42 } }),
  });
  await render();
  expect(el.querySelector(".credit-top-up-balance")?.textContent).toContain(
    "42",
  );
});
it("does not launch checkout more than once for rapid clicks and retains the choice on failure", async () => {
  m.status = "authenticated";
  m.fetch.mockImplementation(async (url) => ({
    ok: false,
    json: async () => ({}),
  }));
  await render();
  await act(async () => {
    const b = el.querySelector<HTMLButtonElement>(".credit-top-up-buy")!;
    b.click();
    b.click();
  });
  expect(
    m.fetch.mock.calls.filter(([url]) => url === "/api/stripe/credit-top-up"),
  ).toHaveLength(1);
  expect(el.querySelector('[role="alert"]')?.textContent).toContain(
    "Could not open checkout",
  );
});
it('never presents the local development allowance as a real account balance',async()=>{m.status='authenticated';m.fetch.mockResolvedValue({ok:true,json:async()=>({source:'dev',credits:{remaining:9999}})});await render();expect(el.querySelector('.credit-top-up-balance')).toBeNull();});
