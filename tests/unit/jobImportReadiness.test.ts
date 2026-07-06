import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("job editor import readiness", () => {
  const source = readFileSync(join(process.cwd(), "pages/job/[job_id].tsx"), "utf8");

  it("resolves stored tab data before importing to the editor", () => {
    expect(source).toContain("async function resolveImportableJob");
    expect(source).toContain("const storedTab = await fetchStoredTabPayload(tabJobId)");
    expect(source).toContain("storedTab.transcriberSegments.length === 0 && storedTab.tabs.length === 0");
  });

  it("does not import immediately when the finalized job payload is missing tabs", () => {
    expect(source).toContain("finalizedJobForImport = await waitForImportableJob(normalizedLatest, displayJob)");
    expect(source).toContain("fetchJob(job_id, { includeOutput: true })");
    expect(source).toContain("finalizedJobForImport = await waitForImportableJob(normalizedFullLatest, normalizedLatest)");
  });

  it("waits for importable tabs before the finalized import button opens the editor", () => {
    expect(source).toContain("const waitForImportableJob = async");
    expect(source).toContain("const importableJob = await waitForImportableJob(displayJob)");
    expect(source).toContain("await importJobToEditor(importableJob, editorChoice, quantize)");
  });
});
