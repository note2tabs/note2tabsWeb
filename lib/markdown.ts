import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkRehype from "remark-rehype";
import rehypeSlug from "rehype-slug";
import rehypeKatex from "rehype-katex";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";
import { visit } from "unist-util-visit";
import GithubSlugger from "github-slugger";

type TocItem = {
  id: string;
  text: string;
  level: number;
};

type RenderMarkdownOptions = {
  enableMath?: boolean;
};

const defaultAttributes = (defaultSchema.attributes || {}) as Record<string, any[]>;
const defaultTagNames = (defaultSchema.tagNames || []) as string[];

const baseSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultAttributes,
    a: ["href", "title", "rel", "target"],
    img: ["src", "alt", "title", "loading"],
    code: ["className"],
    span: ["className"],
    h1: ["id"],
    h2: ["id"],
    h3: ["id"],
    h4: ["id"],
    h5: ["id"],
    h6: ["id"],
  },
};

const mathMlTagNames = [
  "math",
  "annotation",
  "annotation-xml",
  "semantics",
  "mrow",
  "mi",
  "mn",
  "mo",
  "mtext",
  "ms",
  "mspace",
  "mfrac",
  "msqrt",
  "mroot",
  "mstyle",
  "msup",
  "msub",
  "msubsup",
  "munder",
  "mover",
  "munderover",
  "mtable",
  "mtr",
  "mtd",
];

const mathSchema = {
  ...baseSchema,
  tagNames: [...defaultTagNames, ...mathMlTagNames],
  attributes: {
    ...baseSchema.attributes,
    code: [...(defaultAttributes.code || []), ["className", /^language-./, "math-inline", "math-display"]],
    span: [...(defaultAttributes.span || []), ["className", /^katex.*/]],
    div: [...(defaultAttributes.div || []), ["className", /^katex.*/]],
    math: [...(defaultAttributes.math || []), "xmlns", "display"],
    annotation: [...(defaultAttributes.annotation || []), "encoding"],
  },
};

const extractText = (node: any): string => {
  if (!node) return "";
  if (node.type === "text") return node.value || "";
  if (Array.isArray(node.children)) {
    return node.children.map(extractText).join("");
  }
  return "";
};

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const normalizeLatexDelimiters = (value: string) =>
  value
    .replace(/\\\[((?:.|\n)*?)\\\]/g, (_, expr: string) => `$$${expr}$$`)
    .replace(/\\\(((?:.|\n)*?)\\\)/g, (_, expr: string) => `$${expr}$`);

export const renderMarkdown = async (markdown: string, options: RenderMarkdownOptions = {}) => {
  const toc: TocItem[] = [];
  const slugger = new GithubSlugger();
  const enableMath = Boolean(options.enableMath);
  const source = enableMath ? normalizeLatexDelimiters(markdown || "") : markdown || "";

  const processor = unified().use(remarkParse).use(remarkGfm);
  if (enableMath) {
    processor.use(remarkMath);
  }

  processor
    .use(() => (tree) => {
      visit(tree, "heading", (node: any) => {
        const text = extractText(node);
        if (!text) return;
        const id = slugger.slug(text);
        toc.push({ id, text, level: node.depth });
      });
    })
    .use(remarkRehype)
    .use(rehypeSlug);

  if (enableMath) {
    processor.use(rehypeKatex);
  }

  processor.use(rehypeSanitize, enableMath ? mathSchema : baseSchema).use(rehypeStringify);

  const file = await processor.process(source);
  return { html: String(file), toc };
};

export const renderPlainText = async (text: string) => {
  const normalized = (text || "").replace(/\r\n/g, "\n").trim();
  if (!normalized) {
    return { html: "", toc: [] as TocItem[] };
  }

  const paragraphs = normalized
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br />")}</p>`);

  return { html: paragraphs.join(""), toc: [] as TocItem[] };
};

export type { TocItem };
