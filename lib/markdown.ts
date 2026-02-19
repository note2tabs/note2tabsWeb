import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypeSlug from "rehype-slug";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";
import { visit } from "unist-util-visit";
import GithubSlugger from "github-slugger";

type TocItem = {
  id: string;
  text: string;
  level: number;
};

const schema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
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

const extractText = (node: any): string => {
  if (!node) return "";
  if (node.type === "text") return node.value || "";
  if (Array.isArray(node.children)) {
    return node.children.map(extractText).join("");
  }
  return "";
};

export const renderMarkdown = async (markdown: string) => {
  const toc: TocItem[] = [];
  const slugger = new GithubSlugger();

  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(() => (tree) => {
      visit(tree, "heading", (node: any) => {
        const text = extractText(node);
        if (!text) return;
        const id = slugger.slug(text);
        toc.push({ id, text, level: node.depth });
      });
    })
    .use(remarkRehype)
    .use(rehypeSlug)
    .use(rehypeSanitize, schema)
    .use(rehypeStringify);

  const file = await processor.process(markdown || "");
  return { html: String(file), toc };
};

export type { TocItem };
