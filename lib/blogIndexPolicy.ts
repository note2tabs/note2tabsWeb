export type BlogArchiveType = "tag" | "category" | "cluster";

// Archive pages are useful for navigation, but most are thin combinations of
// content that already has a canonical article URL. Search Console showed no
// clicks for tag/category archives in the 2026-06-30–2026-09-29 baseline.
// Keep the one cluster with demonstrated traffic indexable and reassess this
// allowlist against Search Console before adding or removing a cluster.
export const INDEXABLE_BLOG_CLUSTERS = new Set(["audio-to-guitar-tabs"]);

export const shouldIndexBlogArchive = (type: BlogArchiveType, slug: string) =>
  type === "cluster" && INDEXABLE_BLOG_CLUSTERS.has(slug);
