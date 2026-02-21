import type { PostContentMode } from "@prisma/client";
import { renderMarkdown, renderPlainText, type TocItem } from "./markdown";

type TocRow = {
  id: string;
  text: string;
  level: number;
};

const normalizeToc = (toc: TocItem[]): TocRow[] =>
  toc
    .map((item) => ({
      id: item.id,
      text: item.text,
      level: Number(item.level),
    }))
    .filter((item) => item.id && item.text && Number.isFinite(item.level));

export const compilePostContent = async (content: string, contentMode: PostContentMode) => {
  const rendered =
    contentMode === "LATEX"
      ? await renderMarkdown(content, { enableMath: true })
      : await renderPlainText(content);

  return {
    contentHtml: rendered.html,
    contentToc: normalizeToc(rendered.toc),
  };
};

export const parseStoredToc = (value: unknown): TocItem[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      if (typeof row.id !== "string" || typeof row.text !== "string" || typeof row.level !== "number") {
        return null;
      }
      return {
        id: row.id,
        text: row.text,
        level: row.level,
      };
    })
    .filter((item): item is TocItem => Boolean(item));
};
