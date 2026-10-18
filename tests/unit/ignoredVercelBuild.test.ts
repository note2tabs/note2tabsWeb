import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";
const { documentationOnly } = createRequire(import.meta.url)("../../scripts/ignore-vercel-build.cjs");
describe("conservative build skipping", () => {
  it("skips documentation and tests", () => expect(documentationOnly(["docs/release.md", "tests/unit/example.test.ts", "README.md"])).toBe(true));
  it.each([[], ["pages/pricing.tsx"], ["content/blog/post.md"], ["package-lock.json"], ["vercel.json"], ["docs/a.md", "lib/auth.ts"]].map(files => [files]))("builds runtime/configuration/empty changes: %j", (files) => expect(documentationOnly(files)).toBe(false));
});
