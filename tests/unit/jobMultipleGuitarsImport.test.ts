import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("job multiple guitar import choice", () => {
  const source = readFileSync(join(process.cwd(), "pages/job/[job_id].tsx"), "utf8");

  it("does not default missing multiple-guitar state to true", () => {
    expect(source).toContain("useState(false)");
    expect(source).toContain("stored ?? multipleGuitarsHint ?? false");
    expect(source).not.toContain("stored ?? true");
  });

  it("finalizes with the loaded backend multiple-guitar choice", () => {
    expect(source).toContain("const finalizeMultipleGuitars = loadedMultipleGuitars ?? multipleGuitarsHint ?? false");
    expect(source).toContain("JSON.stringify({ multipleGuitars: finalizeMultipleGuitars })");
    expect(source).not.toContain("JSON.stringify({ multipleGuitars: reviewMultipleGuitars })");
  });

  it("uses the original submit choice as a fallback when the backend payload omits it", () => {
    expect(source).toContain("router.query.multipleGuitars");
    expect(source).toContain("parseBooleanFlag(getQueryStringValue(router.query.multipleGuitars))");
  });
});
