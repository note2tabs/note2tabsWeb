import { createServer, type Server } from "node:http";
import { createHmac } from "node:crypto";
import { afterAll, beforeAll, beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { TranscriptionUploadError, uploadTranscriptionFile } from "../../lib/transcriptionUpload";

const originalFetch = globalThis.fetch;
const file = new File(["synthetic audio; no customer data"], "private-song.mp3", { type: "audio/mpeg" });
const message = "Translated secure upload failure";
let server: Server;
let origin: string;
let scenario: string;
let presigns: number;
let puts: number;
let uploaded: Buffer[];
const signature = (value: string) => createHmac("sha256", "local-test-only").update(value).digest("hex");

beforeAll(async () => {
  server = createServer(async (req, res) => {
    const url = new URL(req.url!, origin);
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    if (url.pathname === "/api/uploads/presign") {
      presigns++;
      if (scenario === "presign-denied") {
        res.writeHead(403, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: "Please verify your email." }));
      }
      const key = `uploads/local-test/${presigns}.mp3`;
      const expired = scenario === "always-expired" || (scenario === "expired" && presigns === 1);
      const expires = Date.now() + (expired ? -1000 : 60_000);
      const signed = `${origin}/storage?key=${key}&expires=${expires}&signature=${signature(`${key}:${expires}`)}`;
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ url: signed, key }));
    }
    puts++;
    if (scenario === "disconnect" && presigns === 1) return req.socket.destroy();
    const key = url.searchParams.get("key");
    const expires = url.searchParams.get("expires");
    let code: string | undefined;
    let detail = "Private account and object path must never enter telemetry";
    if (url.searchParams.get("signature") !== signature(`${key}:${expires}`)) code = "SignatureDoesNotMatch";
    else if (Number(expires) < Date.now()) { code = "AccessDenied"; detail = "Request expired at: a test timestamp"; }
    else if (scenario === "denied") code = "AccessDenied";
    if (code) {
      res.writeHead(403, { "Content-Type": "application/xml", "x-guploader-uploadid": "local-request-123" });
      return res.end(`<Error><Code>${code}</Code><Message>Access denied.</Message><Details>${detail}</Details></Error>`);
    }
    uploaded.push(Buffer.concat(chunks));
    res.writeHead(200); res.end();
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterAll(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); });
beforeEach(() => {
  scenario = "ok"; presigns = 0; puts = 0; uploaded = [];
  vi.stubGlobal("fetch", (input: string, init?: RequestInit) => originalFetch(new URL(input, origin), init));
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("real HTTP signed-upload failure reproduction", () => {
  it("renews a confirmed expired URL once and uploads the unchanged file with the new key", async () => {
    scenario = "expired";
    const retry = vi.fn();
    expect(await uploadTranscriptionFile(file, file.name, message, retry)).toBe("uploads/local-test/2.mp3");
    expect({ presigns, puts }).toEqual({ presigns: 2, puts: 2 });
    expect(uploaded).toEqual([Buffer.from(await file.arrayBuffer())]);
    expect(retry).toHaveBeenCalledWith(expect.objectContaining({ http_status: 403, storage_error_code: "access_denied", storage_error_reason: "request_expired", upload_attempt: 1 }));
    expect(JSON.stringify(retry.mock.calls)).not.toMatch(/private-song|signature=|uploads\/|Private account/);
  });
  it("cannot loop when renewed URLs also expire", async () => {
    scenario = "always-expired";
    await expect(uploadTranscriptionFile(file, file.name, message)).rejects.toMatchObject({ stage: "upload_storage", details: { storage_error_reason: "request_expired", upload_attempt: 2 } });
    expect({ presigns, puts }).toEqual({ presigns: 2, puts: 2 });
  });
  it("preserves an unexplained access denial and does not blindly retry it", async () => {
    scenario = "denied";
    const error = await uploadTranscriptionFile(file, file.name, message).catch(e => e);
    expect(error).toBeInstanceOf(TranscriptionUploadError);
    expect(error).toMatchObject({ message, analyticsCode: "storage_failed", stage: "upload_storage", details: { http_status: 403, storage_error_code: "access_denied", request_id: "local-request-123", upload_failure_kind: "http" } });
    expect(error.details.storage_error_reason).toBeUndefined();
    expect(JSON.stringify(error)).not.toMatch(/Private account|private-song|signature=|uploads\//);
    expect(presigns).toBe(1);
  });
  it("distinguishes a broken connection from a 403; manual retry uses a fresh URL and the same file", async () => {
    scenario = "disconnect";
    const error = await uploadTranscriptionFile(file, file.name, message).catch(e => e);
    expect(error).toMatchObject({ stage: "upload_storage", analyticsCode: "network_error", details: { upload_failure_kind: "network", upload_attempt: 1 } });
    expect(error.details.http_status).toBeUndefined();
    expect(presigns).toBe(1);
    expect(await uploadTranscriptionFile(file, file.name, message)).toBe("uploads/local-test/2.mp3");
    expect(uploaded).toEqual([Buffer.from(await file.arrayBuffer())]);
  });
  it("does not confuse the verification gate with storage rejection", async () => {
    scenario = "presign-denied";
    await expect(uploadTranscriptionFile(file, file.name, message)).rejects.toMatchObject({ stage: "upload_presign", message: "Please verify your email.", details: { http_status: 403 } });
    expect(puts).toBe(0);
  });
  it("does not let retry telemetry prevent successful recovery", async () => {
    scenario = "expired";
    expect(await uploadTranscriptionFile(file, file.name, message, () => { throw Error("analytics unavailable"); })).toBe("uploads/local-test/2.mp3");
  });
});

describe("untrusted storage response diagnostics", () => {
  function stubResponse(response: Response) {
    const fetch = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ url: "https://storage.invalid/private?signature=secret", key: "private-key" }))).mockResolvedValueOnce(response);
    vi.stubGlobal("fetch", fetch);
    return fetch;
  }
  it.each([
    ["<Error><Code>SignatureDoesNotMatch</Code><Details>private@example.invalid</Details></Error>", "signature_does_not_match"],
    ["<Error><Code>privateCustomerAccount</Code><Message>Request has expired</Message></Error>", "unknown"],
    ["<html>VPN provider denial: <Code>AccessDenied</Code></html>", "unknown"],
    ["<Error><Code>constructor</Code></Error>", "unknown"],
    ["Not an XML error", "unknown"],
  ])("keeps only an allowlisted code from %s", async (body, expected) => {
    const fetch = stubResponse(new Response(body, { status: 403 }));
    const error = await uploadTranscriptionFile(file, file.name, message).catch(e => e);
    expect(error.details.storage_error_code).toBe(expected);
    expect(error.analyticsCode).toBe("storage_failed");
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(error)).not.toMatch(/signature=|private-key|privateCustomerAccount|private@example/);
  });
  it("caps error-body reads rather than ingesting an entire HTML page", async () => {
    const cancel = vi.fn();
    const stream = new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode("x".repeat(9000))); }, cancel });
    stubResponse(new Response(stream, { status: 403 }));
    const error = await uploadTranscriptionFile(file, file.name, message).catch(e => e);
    expect(error.details.http_status).toBe(403);
    expect(cancel).toHaveBeenCalledOnce();
  });
  it("returns control if an error body stalls indefinitely", async () => {
    vi.useFakeTimers();
    stubResponse(new Response(new ReadableStream(), { status: 403 }));
    const pending = uploadTranscriptionFile(file, file.name, message).catch(e => e);
    await vi.advanceTimersByTimeAsync(1001);
    expect(await pending).toMatchObject({ details: { http_status: 403, storage_error_code: "unknown" } });
  });
});
