import { describe, expect, it } from "vitest";
import { editorRequestError } from "../../lib/gteApi";

describe("editorRequestError", () => {
  it("preserves concise validation guidance", () => {
    expect(editorRequestError('{"error":"Select at least two tracks."}', 400))
      .toBe("Select at least two tracks.");
  });

  it("turns authentication and service failures into recovery guidance", () => {
    expect(editorRequestError("", 401)).toContain("Sign in again");
    expect(editorRequestError("internal failure", 503)).toContain("local changes");
  });

  it("does not expose technical response bodies", () => {
    expect(editorRequestError('{"error":"Prisma stack trace at gs://private"}', 400))
      .toBe("The editor could not complete that action. Check your selection and try again.");
  });
});
