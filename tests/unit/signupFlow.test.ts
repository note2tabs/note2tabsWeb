// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";

const m = vi.hoisted(() => ({
  push: vi.fn(), signIn: vi.fn(), getSession: vi.fn(), send: vi.fn(), google: vi.fn(),
  query: { next: "/transcribe?resumeTranscription=1" } as Record<string, string>,
}));
vi.mock("../../lib/i18n/react", () => ({
  useLocale: () => ({ t: (key: string) => key, locale: "en", href: (path: string) => path }),
  useLocaleRouter: () => ({ query: m.query, isReady: true, push: m.push }),
}));
vi.mock("next/link", () => ({ default: ({ children, ...props }: any) => createElement("a", props, children) }));
vi.mock("next-auth/react", () => ({ signIn: m.signIn, getSession: m.getSession }));
vi.mock("../../components/NoIndexHead", () => ({ default: () => null }));
vi.mock("../../lib/fingerprint", () => ({ generateFingerprint: vi.fn().mockResolvedValue({ fingerprintId: "test-fingerprint" }) }));
vi.mock("../../lib/oauthSignIn", () => ({ startGoogleSignIn: m.google }));
vi.mock("../../lib/analytics", () => ({
  ANALYTICS_EVENTS: { signupStarted: "signup_started", signupFailed: "signup_failed", loginFailed: "login_failed", loginSucceeded: "login_succeeded" },
  sendEvent: m.send, trackCtaClick: vi.fn(),
}));
import SignupPage from "../../pages/auth/signup";
import LoginPage from "../../pages/auth/login";
import RequestResetPage from "../../pages/reset-password";
import { saveAuthEmail } from "../../lib/authEmailHandoff";
let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  m.query = { next: "/transcribe?resumeTranscription=1" };
  m.signIn.mockResolvedValue({ ok: true, error: null, url: null });
  m.push.mockResolvedValue(true);
  m.getSession.mockResolvedValue({ user: { isEmailVerified: true } });
  m.google.mockResolvedValue(true);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) }));
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
async function render(page = SignupPage) { await act(async () => { root.render(createElement(page)); }); }
async function change(selector: string, value: string) {
  const input = container.querySelector<HTMLInputElement>(selector)!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function submit() { await act(async () => { container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); }); }

describe("signup and login recovery", () => {
  it("keeps the form short, Google visible first, and login intent intact", async () => {
    await render();
    expect(container.querySelectorAll('form input:not([type="checkbox"])')).toHaveLength(2);
    expect(container.querySelector('input[autocomplete="new-password"]')?.getAttribute("minlength")).toBe("10");
    expect(container.textContent).toContain("Password must be at least 10 characters.");
    const google = container.querySelector('button[type="button"]')!;
    expect(google.compareDocumentPosition(container.querySelector("form")!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const login = container.querySelector<HTMLAnchorElement>('.auth-mode-switch a')!;
    expect(new URL(login.href).searchParams.get("next")).toBe(m.query.next);
    await act(async () => { container.querySelector<HTMLButtonElement>('[aria-controls="signup-password"]')!.click(); });
    expect(container.querySelector('#signup-password')?.getAttribute("type")).toBe("text");
    expect(container.querySelector('[aria-controls="signup-password"]')?.getAttribute('aria-label')).toBe('Hide password');
    await act(async () => { container.querySelector<HTMLButtonElement>('[aria-controls="signup-password"]')!.click(); });
    expect(container.querySelector('#signup-password')?.getAttribute('type')).toBe('password');
    expect(container.textContent).not.toContain('No credit card required');
  });
  it("counts first form interaction once and never includes input values", async () => {
    await render();
    await act(async () => {
      container.querySelector<HTMLInputElement>('#signup-email')!.focus();
      container.querySelector<HTMLInputElement>('#signup-password')!.focus();
    });
    expect(m.send.mock.calls.filter(call => call[0] === "signup_form_interacted")).toHaveLength(1);
    expect(m.send).toHaveBeenCalledWith("signup_form_interacted", { method: "email", surface: "signup_page" });
  });
  it("records browser validation once per unchanged form without credentials", async () => {
    await render();
    await act(async () => { container.querySelector('form')!.reportValidity(); container.querySelector('form')!.reportValidity(); });
    const calls = m.send.mock.calls.filter(call => call[0] === "signup_validation_failed");
    expect(calls).toHaveLength(1);
    expect(calls[0][1]).toEqual({ method: "email", surface: "signup_page", error_code: "required_field", field: "email" });
  });
  it("signs in a new account and resumes the saved transcription without a second signup event", async () => {
    await render(); await change('#signup-email', 'test@example.com'); await change('#signup-password', 'test-password'); await submit();
    expect(m.signIn).toHaveBeenCalledWith("credentials", expect.objectContaining({ redirect: false, email: 'test@example.com', password: 'test-password', callbackUrl: m.query.next }));
    expect(m.push).toHaveBeenCalledWith(m.query.next);
    expect(m.send.mock.calls.some(call => call[0] === 'signup_completed')).toBe(false);
    expect(JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string)).not.toHaveProperty('name');
  });
  it.each(['rejected', 'network', 'missing'])("recovers %s automatic login without stranding the new account", async kind => {
    if (kind === 'rejected') m.signIn.mockResolvedValue({ ok: false, error: "CredentialsSignin" });
    if (kind === 'network') m.signIn.mockRejectedValue(new TypeError("Failed to fetch"));
    if (kind === 'missing') m.signIn.mockResolvedValue(undefined);
    await render(); await submit();
    const target = new URL(m.push.mock.calls[0][0], 'https://note2tabs.com');
    expect(target.pathname).toBe('/auth/login');
    expect(target.searchParams.get('next')).toBe(m.query.next);
    expect(target.searchParams.get('accountCreated')).toBe('1');
    expect(m.send).toHaveBeenCalledWith('login_failed', expect.objectContaining({ error_code: 'signup_auto_login_failed' }));
    expect(m.send.mock.calls.some(call => call[0] === 'signup_failed')).toBe(false);
  });
  it("builds a valid recovery URL when the requested destination is the homepage", async () => {
    m.query.next = '/'; m.signIn.mockResolvedValue({ ok: false }); await render(); await submit();
    expect(m.push).toHaveBeenCalledWith('/auth/login?accountCreated=1');
  });
  it("allows retry after signup failure", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, json: async () => ({ error: 'An account with this email already exists.' }) } as Response);
    await render(); await submit(); expect(m.signIn).not.toHaveBeenCalled(); await submit();
    expect(fetch).toHaveBeenCalledTimes(2); expect(m.push).toHaveBeenCalledWith(m.query.next);
  });
  it("places an existing-account error beside email with direct recovery and keeps the email out of URLs", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, json: async () => ({ error: 'An account with this email already exists.' }) } as Response);
    await render(); await change('#signup-email','existing@example.com'); await submit();
    const error = container.querySelector('#signup-email-error')!;
    expect(error.textContent).toContain('An account with this email already exists.');
    expect(error.textContent).toContain('Forgot password?');
    expect(container.querySelector('#signup-email')?.getAttribute('aria-invalid')).toBe('true');
    const login = error.querySelector<HTMLAnchorElement>('a')!;
    expect(login.href).not.toContain('existing');
    expect(new URL(login.href).searchParams.get('next')).toBe(m.query.next);
    login.addEventListener('click', event => event.preventDefault());
    await act(async () => { login.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true})); });
    await act(async () => { root.render(createElement(LoginPage)); });
    expect(container.querySelector<HTMLInputElement>('#login-email')!.value).toBe('existing@example.com');
    expect(container.querySelector<HTMLInputElement>('#login-password')!.value).toBe('');
  });
  it("places a password rejection beside the password and clears it when corrected", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok:false,json:async()=>({error:'Password must be at least 10 characters.'}) } as Response);
    await render(); await submit();
    expect(container.querySelector('#signup-password-error')?.textContent).toContain('10 characters');
    expect(container.querySelector('#signup-password')?.getAttribute('aria-invalid')).toBe('true');
    await change('#signup-password','corrected-password');
    expect(container.querySelector('#signup-password-error')).toBeNull();
  });
  it("prefills password reset from temporary storage without sending a reset email", async () => {
    saveAuthEmail('existing@example.com');
    await act(async () => { root.render(createElement(RequestResetPage)); });
    expect(container.querySelector<HTMLInputElement>('#reset-email')!.value).toBe('existing@example.com');
    expect(fetch).not.toHaveBeenCalled();
  });
  it("labels account creation as free without adding a banner", async () => {
    await render(); expect(container.querySelector('button[type="submit"]')?.textContent).toBe('Create free account');
  });
  it("prevents rapid duplicate account creation", async () => {
    await render();
    await act(async () => { const form = container.querySelector('form')!; form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
    expect(fetch).toHaveBeenCalledOnce();
  });
  it("allows Google retry after a failed startup and preserves upload intent", async () => {
    m.google.mockResolvedValueOnce(false);
    await render();
    await act(async () => { container.querySelector<HTMLButtonElement>('button[type="button"]')!.click(); });
    expect(container.querySelector('button[type="button"]')?.hasAttribute('disabled')).toBe(false);
    await act(async () => { container.querySelector<HTMLButtonElement>('button[type="button"]')!.click(); });
    expect(m.google).toHaveBeenCalledTimes(2);
    expect(m.google).toHaveBeenLastCalledWith('signup', m.query.next);
  });
  it("makes signup visible before login credentials and preserves the destination", async () => {
    await render(LoginPage);
    const signup = container.querySelector<HTMLAnchorElement>('.auth-mode-switch a')!;
    expect(new URL(signup.href).searchParams.get('next')).toBe(m.query.next);
    expect(signup.textContent).toBe('Sign up');
    m.signIn.mockResolvedValueOnce({ ok: false, error: 'CredentialsSignin' }); await submit();
    expect(m.send).toHaveBeenCalledWith('login_failed', { method: 'credentials', error_code: 'credentials_rejected' });
    expect(m.push).not.toHaveBeenCalled();
  });
});
