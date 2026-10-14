import { describe, expect, it } from "vitest";
import { createBrowserExceptionContext } from "../../lib/browserExceptionContext";

const nativeError = (overrides: Partial<ErrorEvent> = {}) => ({
  message: "Script error.", filename: "", lineno: 0, colno: 0, error: null,
  ...overrides,
});
const exceptions = (value = "Script error.") => [{ type: "Error", value }];

describe("native browser exception context", () => {
  it("distinguishes an opaque native event from missing diagnostics without changing its message", () => {
    const collector = createBrowserExceptionContext();
    collector.observe(nativeError());
    expect(collector.consume(exceptions())).toEqual({ browser_error_has_object: false });
    expect(collector.consume(exceptions())).toBeUndefined();
  });

  it("preserves native location for a synthetic exception while scrubbing private URLs", () => {
    const collector = createBrowserExceptionContext();
    collector.observe(nativeError({ filename: "https://user:password@note2tabs.com/reset-password/secret?email=private@example.com#token", lineno: 27, colno: 3 }));
    expect(collector.consume(exceptions())).toEqual({
      browser_error_has_object: false,
      browser_error_source_url: "https://note2tabs.com/reset-password/[token]",
      browser_error_line: 27,
      browser_error_column: 3,
    });
  });

  it("matches the error object's message instead of the browser's Uncaught prefix", () => {
    const collector = createBrowserExceptionContext();
    collector.observe(nativeError({ message: "Uncaught TypeError: Broken save", error: new TypeError("Broken save") }));
    expect(collector.consume(exceptions("Broken save"))).toEqual({ browser_error_has_object: true });
  });

  it("does not attach another error's context or reuse expired context", () => {
    let time = 100;
    const collector = createBrowserExceptionContext(() => time);
    collector.observe(nativeError());
    expect(collector.consume(exceptions("Failed to fetch"))).toBeUndefined();
    expect(collector.consume([{ type: "UnhandledRejection", value: "Script error." }])).toBeUndefined();
    expect(collector.consume(null)).toBeUndefined();
    time += 2_001;
    expect(collector.consume(exceptions())).toBeUndefined();
  });

  it("does not annotate a later capture with an identical message", async () => {
    const collector = createBrowserExceptionContext();
    collector.observe(nativeError());
    await Promise.resolve();
    expect(collector.consume(exceptions())).toBeUndefined();
  });

  it("clears context on opt-out and ignores resource-load events", () => {
    const collector = createBrowserExceptionContext();
    collector.observe(nativeError());
    collector.clear();
    expect(collector.consume(exceptions())).toBeUndefined();
    collector.observe(nativeError());
    collector.observe({} as ErrorEvent);
    expect(collector.consume(exceptions())).toBeUndefined();
  });

  it("does not capture script contents or invalid locations or throw on hostile error objects", () => {
    for (const filename of ["data:text/javascript,private", "blob:https://example.com/private", "not-a-url"]) {
      const collector = createBrowserExceptionContext();
      collector.observe(nativeError({ filename, lineno: -1, colno: NaN, error: { get message() { throw new Error("unsafe"); } } }));
      expect(collector.consume(exceptions())).toEqual({ browser_error_has_object: true });
    }
  });
});
