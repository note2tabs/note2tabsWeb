// @vitest-environment jsdom
import { StrictMode, act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ status: "loading", query: {} as Record<string,string>, create: vi.fn(), replace: vi.fn() }));
vi.mock("next-auth/react", () => ({ useSession: () => ({ status: mocks.status }) }));
vi.mock("next/head", () => ({ default: () => null }));
vi.mock("../../lib/i18n/react", () => ({
  useLocale: () => ({ t: (s: string) => s, locale: "en" }),
  useLocaleRouter: () => ({ replace: mocks.replace, query: mocks.query }),
}));
vi.mock("../../lib/i18n/editor/request", () => ({ withEditorLocale: (fn: unknown) => fn }));
vi.mock("../../lib/gteApi", () => ({ gteApi: { createEditor: mocks.create } }));
import NewEditorPage from "../../pages/gte/new";

let root: Root;
let element: HTMLDivElement;
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  mocks.status = "loading";
  mocks.query = {};
  mocks.create.mockReset().mockResolvedValue({ editorId: "created-tab" });
  mocks.replace.mockReset().mockResolvedValue(true);
  element = document.createElement("div");
  root = createRoot(element);
});
afterEach(async () => { await act(async () => root.unmount()); });
const render = () => act(async () => root.render(createElement(StrictMode, null, createElement(NewEditorPage))));

it.each(["authenticated", "unauthenticated"])("keeps bass intent in the %s workspace entry", async status => {
  mocks.status = status;
  mocks.query = { track: "bass" };
  await render();
  expect(mocks.replace).toHaveBeenCalledExactlyOnceWith(`/gte/${status === "authenticated" ? "created-tab" : "local"}?track=bass`);
});

it("waits for authentication before creating exactly one tab under StrictMode", async () => {
  await render();
  expect(mocks.create).not.toHaveBeenCalled();
  expect(mocks.replace).not.toHaveBeenCalled();
  mocks.status = "authenticated";
  await render();
  expect(mocks.create).toHaveBeenCalledTimes(1);
  expect(mocks.replace).toHaveBeenCalledExactlyOnceWith("/gte/created-tab");
});
it("opens the guest workspace without creating a server record", async () => {
  mocks.status = "unauthenticated";
  await render();
  expect(mocks.create).not.toHaveBeenCalled();
  expect(mocks.replace).toHaveBeenCalledExactlyOnceWith("/gte/local");
});
it("offers an explicit retry after creation fails", async () => {
  mocks.status = "authenticated";
  mocks.create.mockRejectedValueOnce(new Error("Connection failed"));
  await render();
  expect(element.querySelector('[role="alert"]')?.textContent).toBe("Connection failed");
  expect(mocks.create).toHaveBeenCalledTimes(1);
  await act(async () => element.querySelector("button")!.click());
  expect(mocks.create).toHaveBeenCalledTimes(2);
  expect(mocks.replace).toHaveBeenCalledWith("/gte/created-tab");
});
it("reuses the created tab if navigation fails instead of creating a duplicate", async () => {
  mocks.status = "authenticated";
  mocks.replace.mockRejectedValueOnce(new Error("Navigation failed"));
  await render();
  await act(async () => element.querySelector("button")!.click());
  expect(mocks.create).toHaveBeenCalledTimes(1);
  expect(mocks.replace).toHaveBeenCalledTimes(2);
});
