import { describe, expect, it } from "vitest";
import { INDEXABLE_BLOG_CLUSTERS, shouldIndexBlogArchive } from "../../lib/blogIndexPolicy";

describe("blog archive index policy", () => {
  it("keeps thin tag and category archives out of the search index", () => {
    expect(shouldIndexBlogArchive("tag", "guitar-tabs")).toBe(false);
    expect(shouldIndexBlogArchive("category", "guitar-tabs")).toBe(false);
  });

  it("protects the cluster hub with demonstrated organic traffic", () => {
    expect(INDEXABLE_BLOG_CLUSTERS).toContain("audio-to-guitar-tabs");
    expect(shouldIndexBlogArchive("cluster", "audio-to-guitar-tabs")).toBe(true);
    expect(shouldIndexBlogArchive("cluster", "unproven-topic")).toBe(false);
  });
});
