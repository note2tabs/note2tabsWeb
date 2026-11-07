// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("../../components/LocaleLink", () => ({ default: ({ children, ...props }: any) => React.createElement("a", props, children) }));
import TranscriptionBlockCard from "../../components/TranscriptionBlockCard";

let root: Root, host: HTMLDivElement;
beforeEach(() => { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); host = document.createElement("div"); document.body.append(host); root = createRoot(host); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
const render = (props: any) => act(async () => root.render(React.createElement(TranscriptionBlockCard, props)));

it("offers a real Verify now button that goes to verification", async () => {
  await render({ tone: "verify", eyebrow: "Email verification", title: "Verify your email", description: "Verify your email to continue transcribing.", actionLabel: "Verify now", href: "/auth/verify-email?next=%2F" });
  const button = host.querySelector("a.button-primary") as HTMLAnchorElement;
  expect(button.textContent).toBe("Verify now");
  expect(button.getAttribute("href")).toBe("/auth/verify-email?next=%2F");
  expect(host.querySelector("h3")?.textContent).toBe("Verify your email");
  expect(host.querySelector("aside")?.getAttribute("role")).toBe("status");
  expect(host.querySelector(".transcription-block-card--verify")).not.toBeNull();
});
it("renders without an action, announces as an alert, and shows the detail line", async () => {
  await render({ tone: "credits", role: "alert", title: "Not enough credits", description: "Needs 10, 3 left.", detail: "Your credits reset 1 November" });
  expect(host.querySelector("a")).toBeNull();
  expect(host.querySelector("aside")?.getAttribute("role")).toBe("alert");
  expect(host.textContent).toContain("Your credits reset 1 November");
});
