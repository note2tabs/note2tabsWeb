import { describe, it, expect, vi, beforeEach } from "vitest";
const { track } = vi.hoisted(() => ({ track: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../../../lib/analyticsV2", () => ({ track }));
import { beginTransfer } from "../../../lib/engagement/transferTracking";
describe("transfer tracking", () => {
  beforeEach(() => track.mockClear());
  it("separates browser handoff from disk save and deduplicates terminal state", () => {
    const t = beginTransfer("export", "midi", "gte", "p"); t.prepared(); t.completed(); t.completed(); t.failed();
    expect(track.mock.calls.map(c => c[0])).toEqual(["gte_export_requested", "gte_export_prepared", "gte_export_download_initiated"]);
    expect(new Set(track.mock.calls.map(c => c[1].transfer_id)).size).toBe(1);
  });
  it("records successful persisted import, not an onImported navigation failure", () => {
    const t = beginTransfer("import", "musicxml", "file_picker"); t.completed("p"); t.failed();
    expect(track.mock.calls.at(-1)).toEqual(["gte_file_import_completed", expect.objectContaining({ editor_id: "p" })]);
  });
  it("does not break product operations if analytics throws", () => {
    track.mockImplementationOnce(() => { throw new Error("offline"); });
    expect(() => beginTransfer("export", "txt", "library")).not.toThrow();
  });
});
