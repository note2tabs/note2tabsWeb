import type { PostStatus } from "@prisma/client";

export const BLOG_PAGE_SIZE = 8;

export const getBaseUrl = () => {
  const raw =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXTAUTH_URL ||
    "http://localhost:3000";
  return raw.endsWith("/") ? raw.slice(0, -1) : raw;
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
