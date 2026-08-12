import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMocks } from "node-mocks-http";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  fetch: vi.fn(),
  shares: {
    findMany: vi.fn(),
    count: vi.fn(),
    create: vi.fn(),
    updateMany: vi.fn(),
    findUnique: vi.fn(),
  },
  canvases: { findUnique: vi.fn() },
  legacyEditors: { findUnique: vi.fn() },
}));

vi.mock("next-auth/next", () => ({
  getServerSession: (...args: unknown[]) => mocks.session(...args),
}));

vi.mock("../../pages/api/auth/[...nextauth]", () => ({
  authOptions: {},
}));

vi.mock("../../lib/prisma", () => ({
  prisma: {
    tabEmbedShare: mocks.shares,
    canvases: mocks.canvases,
    editor_snapshots: mocks.legacyEditors,
  },
}));

import createOrListHandler from "../../pages/api/embed/shares";
import revokeHandler from "../../pages/api/embed/shares/[share_id]";
import publicEmbedHandler from "../../pages/api/embed/tabs/[share_id]";
import { clearEmbedCacheForTests } from "../../lib/embedTabs";

const secret = "a".repeat(43);
const tokenHash = createHash("sha256").update(secret, "utf8").digest("hex");
const createdAt = new Date("2026-08-12T12:00:00.000Z");

const upstreamSnapshot = {
  id: "private-editor-id",
  name: "Public song title",
  userId: "owner-user-1",
  ownerEmail: "owner@example.test",
  sourceAudioUrl: "https://storage.example.test/private.wav?signature=secret",
  selectedNoteIds: ["private-note-id"],
  editors: [
    {
      id: "private-lane-id",
      name: "Guitar",
      trackType: "tab",
      framesPerMessure: 480,
      fps: 240,
      totalFrames: 480,
      secondsPerBar: 2,
      timeSignature: 4,
      timeSignatureBottom: 4,
      notes: [
        {
          id: "private-note-id",
          startTime: 0,
          length: 120,
          midiNum: 64,
          tab: [0, 3],
          optimals: [[5, 99]],
        },
      ],
      chords: [],
      sourceAudio: "private-source-audio",
    },
  ],
};

const validShare = (overrides: Record<string, unknown> = {}) => ({
  userId: "owner-user-1",
  editorId: "editor_123",
  tokenHash,
  revokedAt: null,
  ...overrides,
});

const jsonData = (res: ReturnType<typeof createMocks>["res"]) => {
  const data = res._getData();
  return typeof data === "string" ? JSON.parse(data) : data;
};

describe("embedded tab APIs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearEmbedCacheForTests();
    vi.stubGlobal("fetch", mocks.fetch);
    mocks.session.mockResolvedValue({ user: { id: "owner-user-1" } });
    mocks.shares.findMany.mockResolvedValue([]);
    mocks.shares.count.mockResolvedValue(0);
    mocks.shares.create.mockResolvedValue({
      id: "share_123",
      tokenFingerprint: "f00dbabe",
      createdAt,
    });
    mocks.shares.updateMany.mockResolvedValue({ count: 1 });
    mocks.shares.findUnique.mockResolvedValue(validShare());
    mocks.canvases.findUnique.mockResolvedValue({ canvas_id: "editor_123" });
    mocks.legacyEditors.findUnique.mockResolvedValue(null);
    mocks.fetch.mockResolvedValue(
      new Response(JSON.stringify(upstreamSnapshot), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );
  });

  it("rejects anonymous share creation before touching the editor or database", async () => {
    mocks.session.mockResolvedValue(null);
    const { req, res } = createMocks({
      method: "POST",
      body: { editorId: "editor_123" },
    });

    await createOrListHandler(req as any, res as any);

    expect(res._getStatusCode()).toBe(401);
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.shares.create).not.toHaveBeenCalled();
  });

  it("refuses to mint a token unless the signed-in user owns the editor", async () => {
    mocks.canvases.findUnique.mockResolvedValue(null);
    mocks.legacyEditors.findUnique.mockResolvedValue(null);
    const { req, res } = createMocks({
      method: "POST",
      body: { editorId: "editor_owned_by_someone_else" },
    });

    await createOrListHandler(req as any, res as any);

    expect(res._getStatusCode()).toBe(404);
    expect(jsonData(res)).toEqual({ error: "Editor not found" });
    expect(mocks.canvases.findUnique).toHaveBeenCalledWith({
      where: {
        user_id_canvas_id: {
          user_id: "owner-user-1",
          canvas_id: "editor_owned_by_someone_else",
        },
      },
      select: { canvas_id: true },
    });
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.shares.create).not.toHaveBeenCalled();
  });

  it("verifies ownership upstream and stores only the secret hash", async () => {
    const { req, res } = createMocks({
      method: "POST",
      body: { editorId: "editor_123" },
    });

    await createOrListHandler(req as any, res as any);

    expect(res._getStatusCode()).toBe(201);
    expect(mocks.fetch).toHaveBeenCalledOnce();
    const [upstreamUrl, options] = mocks.fetch.mock.calls[0];
    expect(upstreamUrl).toContain("/gte/editors/editor_123");
    expect(options.headers).toMatchObject({ "X-User-Id": "owner-user-1" });

    const createInput = mocks.shares.create.mock.calls[0][0];
    expect(createInput.data).toMatchObject({
      userId: "owner-user-1",
      editorId: "editor_123",
      tokenFingerprint: expect.stringMatching(/^[a-f0-9]{8}$/),
      tokenHash: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(createInput.data).not.toHaveProperty("token");
    expect(createInput.data).not.toHaveProperty("secret");
    expect(createInput.data.tokenFingerprint).toBe(createInput.data.tokenHash.slice(0, 8));

    const response = jsonData(res);
    const embedUrl = new URL(response.embedUrl);
    const returnedSecret = embedUrl.hash.slice(1);
    expect(embedUrl.search).toBe("");
    expect(createInput.data.tokenHash).toBe(
      createHash("sha256").update(returnedSecret, "utf8").digest("hex")
    );
    expect(response.iframeHtml).toContain(
      'sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"'
    );
  });

  it("lists only safe share summaries, never recoverable credentials or ownership fields", async () => {
    mocks.shares.findMany.mockResolvedValue([
      { id: "share_123", tokenFingerprint: "f00dbabe", createdAt },
    ]);
    const { req, res } = createMocks({
      method: "GET",
      query: { editorId: "editor_123" },
    });

    await createOrListHandler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    expect(jsonData(res)).toEqual({
      shares: [
        { id: "share_123", tokenFingerprint: "f00dbabe", createdAt: createdAt.toISOString() },
      ],
    });
    expect(JSON.stringify(jsonData(res))).not.toContain(tokenHash);
    expect(mocks.shares.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "owner-user-1", editorId: "editor_123", revokedAt: null },
        select: { id: true, tokenFingerprint: true, createdAt: true },
      })
    );
  });

  it("returns a sanitized read-only payload for a valid unrevoked credential", async () => {
    const { req, res } = createMocks({
      method: "GET",
      query: { share_id: "share_123" },
      headers: { authorization: `Bearer ${secret}` },
    });

    await publicEmbedHandler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    expect(res.getHeader("X-Robots-Tag")).toContain("noindex");
    expect(res.getHeader("Referrer-Policy")).toBe("no-referrer");
    expect(res.getHeader("ETag")).toMatch(/^"[A-Za-z0-9_-]+"$/);
    const response = jsonData(res);
    expect(response).toMatchObject({
      schemaVersion: 1,
      title: "Public song title",
      tracks: [{ id: "track-1", name: "Guitar", kind: "tab" }],
    });
    const serialized = JSON.stringify(response);
    for (const privateValue of [
      "owner-user-1",
      "owner@example.test",
      "private-editor-id",
      "private-lane-id",
      "private-note-id",
      "storage.example.test",
      "private-source-audio",
    ]) {
      expect(serialized).not.toContain(privateValue);
    }
  });

  it.each([
    ["wrong secret", validShare(), "b".repeat(43)],
    ["revoked share", validShare({ revokedAt: new Date() }), secret],
    ["unknown share", null, secret],
  ])("returns the same 404 for a %s without loading editor data", async (_case, share, credential) => {
    mocks.shares.findUnique.mockResolvedValue(share);
    const { req, res } = createMocks({
      method: "GET",
      query: { share_id: "share_123" },
      headers: { authorization: `Bearer ${credential}` },
    });

    await publicEmbedHandler(req as any, res as any);

    expect(res._getStatusCode()).toBe(404);
    expect(jsonData(res)).toEqual({ error: "Embedded tab not found" });
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("revalidates the share in the database while reusing only sanitized editor output", async () => {
    const first = createMocks({
      method: "GET",
      query: { share_id: "share_123" },
      headers: { authorization: `Bearer ${secret}` },
    });
    await publicEmbedHandler(first.req as any, first.res as any);
    const etag = String(first.res.getHeader("ETag"));

    const second = createMocks({
      method: "GET",
      query: { share_id: "share_123" },
      headers: { authorization: `Bearer ${secret}`, "if-none-match": etag },
    });
    await publicEmbedHandler(second.req as any, second.res as any);

    expect(first.res._getStatusCode()).toBe(200);
    expect(second.res._getStatusCode()).toBe(304);
    expect(mocks.shares.findUnique).toHaveBeenCalledTimes(2);
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
  });

  it("revokes only an authenticated owner's active share", async () => {
    const { req, res } = createMocks({
      method: "DELETE",
      query: { share_id: "share_123" },
    });

    await revokeHandler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    expect(mocks.shares.updateMany).toHaveBeenCalledWith({
      where: { id: "share_123", userId: "owner-user-1", revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });

  it("does not reveal whether a different owner's share exists", async () => {
    mocks.shares.updateMany.mockResolvedValue({ count: 0 });
    const { req, res } = createMocks({
      method: "DELETE",
      query: { share_id: "share_belongs_to_someone_else" },
    });

    await revokeHandler(req as any, res as any);

    expect(res._getStatusCode()).toBe(404);
    expect(jsonData(res)).toEqual({ error: "Embed not found" });
  });

  it("rate-limits public credential attempts and tells clients when to retry", async () => {
    let finalResponse: any = null;
    for (let attempt = 0; attempt <= 180; attempt += 1) {
      const { req, res } = createMocks({
        method: "GET",
        query: { share_id: "share_123" },
        headers: { "x-forwarded-for": "203.0.113.250" },
      });
      await publicEmbedHandler(req as any, res as any);
      finalResponse = res;
    }

    expect(finalResponse?._getStatusCode()).toBe(429);
    expect(finalResponse?.getHeader("Retry-After")).toMatch(/^\d+$/);
    expect(mocks.shares.findUnique).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
});
