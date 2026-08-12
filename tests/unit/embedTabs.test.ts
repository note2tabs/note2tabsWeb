import { describe, expect, it } from "vitest";
import {
  buildEmbedCredentials,
  createEmbedSecret,
  hashEmbedSecret,
  readEmbedBearerSecret,
  sanitizeEditorForEmbed,
  verifyEmbedSecret,
} from "../../lib/embedTabs";
import { isValidEmbedIdentifier } from "../../lib/embedIdentifiers";

const privateSnapshot = () => ({
  id: "private-editor-id",
  name: "\u202eMy song",
  userId: "owner-user-id",
  ownerEmail: "owner@example.test",
  sourceAudioUrl: "https://storage.example.test/private-source.wav?signature=secret",
  privateEditorState: { selectedNoteIds: ["private-note-id"] },
  editors: [
    {
      id: "private-lane-id",
      name: "Lead guitar",
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
          sourceAudioUrl: "https://storage.example.test/note.wav",
        },
      ],
      chords: [],
      noteEffects: [],
      cutPositionsWithCoords: [[[0, 480], [2, 0]]],
      optimalsByTime: { "0": { "64": [[5, 99]] } },
      sourceAudio: "base64-private-audio",
    },
  ],
});

describe("embedded tab security helpers", () => {
  it("creates verifiable high-entropy secrets without accepting malformed credentials", () => {
    const secret = createEmbedSecret();
    const hash = hashEmbedSecret(secret);

    expect(secret).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(verifyEmbedSecret(secret, hash)).toBe(true);
    expect(verifyEmbedSecret(`${secret}x`, hash)).toBe(false);
    expect(verifyEmbedSecret(secret, "not-a-hash")).toBe(false);
    expect(readEmbedBearerSecret(`Bearer ${secret}`)).toBe(secret);
    expect(readEmbedBearerSecret(`Basic ${secret}`)).toBeNull();
  });

  it("keeps the secret in the URL fragment and emits a constrained iframe", () => {
    const secret = createEmbedSecret();
    const { embedUrl, iframeHtml } = buildEmbedCredentials({
      baseUrl: "https://www.note2tabs.com/",
      shareId: "share_123",
      secret,
      title: 'Song \"one\" <private>',
    });
    const parsed = new URL(embedUrl);

    expect(parsed.pathname).toBe("/embed/tabs/share_123");
    expect(parsed.search).toBe("");
    expect(parsed.hash).toBe(`#${secret}`);
    expect(iframeHtml).toContain('referrerpolicy="no-referrer"');
    expect(iframeHtml).toContain(
      'sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"'
    );
    expect(iframeHtml).toContain("&quot;");
    expect(iframeHtml).not.toContain('<private>');
  });

  it("publishes only an explicit read-only display payload", () => {
    const payload = sanitizeEditorForEmbed(privateSnapshot());
    const serialized = JSON.stringify(payload);

    expect(payload).toEqual(
      expect.objectContaining({
        schemaVersion: 1,
        title: "My song",
        bpm: 120,
        timeSignature: "4/4",
      })
    );
    expect(payload.tracks).toHaveLength(1);
    expect(payload.tracks[0]).toMatchObject({
      id: "track-1",
      name: "Lead guitar",
      kind: "tab",
      truncated: false,
    });
    expect(payload.tracks[0].tabText).toContain("3");

    for (const privateValue of [
      "private-editor-id",
      "private-lane-id",
      "private-note-id",
      "owner-user-id",
      "owner@example.test",
      "storage.example.test",
      "base64-private-audio",
      "signature=secret",
    ]) {
      expect(serialized).not.toContain(privateValue);
    }
    expect(serialized).not.toContain("optimalsByTime");
    expect(serialized).not.toContain("sourceAudio");
    expect(serialized).not.toContain("privateEditorState");
  });

  it("renders supported drum hits without exposing original lane identifiers", () => {
    const payload = sanitizeEditorForEmbed({
      name: "Drum study",
      editors: [
        {
          id: "private-drum-lane",
          name: "Kit",
          trackType: "drums",
          framesPerMessure: 480,
          totalFrames: 480,
          secondsPerBar: 2,
          notes: [
            { id: 999, startTime: 0, length: 30, midiNum: 36, tab: [4, 0] },
            { id: 1000, startTime: 240, length: 30, midiNum: 38, tab: [5, 0] },
          ],
          chords: [],
        },
      ],
    });

    expect(payload.tracks[0]).toMatchObject({ id: "track-1", kind: "drums" });
    expect(payload.tracks[0].tabText).toContain("KIK|x");
    expect(payload.tracks[0].tabText).toContain("SNR|");
    expect(JSON.stringify(payload)).not.toContain("private-drum-lane");
  });

  it("rejects unsafe route identifiers and does not manufacture tracks from malformed data", () => {
    expect(isValidEmbedIdentifier("share_abc-123")).toBe(true);
    expect(isValidEmbedIdentifier("../private")).toBe(false);
    expect(isValidEmbedIdentifier("share?token=secret")).toBe(false);
    expect(sanitizeEditorForEmbed({ sourceAudioUrl: "private" }).tracks).toEqual([]);
  });
});
