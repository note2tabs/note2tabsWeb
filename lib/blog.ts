import type { PostStatus } from "@prisma/client";
import { getConfiguredSiteUrl } from "./siteUrl";

export const BLOG_PAGE_SIZE = 8;

export const getBaseUrl = () => {
  return getConfiguredSiteUrl();
};

export const getPublishedWhere = () => {
  const now = new Date();
  return {
    OR: [
      { status: "PUBLISHED" as PostStatus },
      { status: "SCHEDULED" as PostStatus, publishAt: { lte: now } },
    ],
  };
};

export const estimateReadingTime = (text: string) => {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const minutes = Math.max(1, Math.ceil(words / 200));
  return { minutes, words };
};
