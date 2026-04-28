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

const defaultAttributes = (defaultSchema.attributes || {}) as Record<string, any[]>;

const baseSchema = {
  ...defaultSchema,
  clobberPrefix: "",
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

const extractText = (node: any): string => {
  if (!node) return "";
  if (node.type === "text") return node.value || "";
  if (Array.isArray(node.children)) {
    return node.children.map(extractText).join("");
  }
  return "";
};

const stripLatexComments = (value: string) =>
  value
    .split("\n")
    .map((line) => {
      let inEscape = false;
      for (let i = 0; i < line.length; i += 1) {
        const char = line[i];
        if (char === "\\" && !inEscape) {
          inEscape = true;
          continue;
        }
        if (char === "%" && !inEscape) {
          return line.slice(0, i);
        }
        inEscape = false;
      }
      return line;
    })
    .join("\n");

const normalizeInlineLatexFormatting = (value: string): string => {
  let output = value;
  for (let i = 0; i < 8; i += 1) {
    const prev = output;
    output = output
      .replace(/\\href\{([^{}]+)\}\{([^{}]+)\}/g, "[$2]($1)")
      .replace(/\\url\{([^{}]+)\}/g, "<$1>")
      .replace(/\\textbf\{([^{}]*)\}/g, "**$1**")
      .replace(/\\textit\{([^{}]*)\}/g, "*$1*")
      .replace(/\\emph\{([^{}]*)\}/g, "*$1*")
      .replace(/\\underline\{([^{}]*)\}/g, "_$1_")
      .replace(/\\texttt\{([^{}]*)\}/g, "`$1`")
      .replace(/\\textsc\{([^{}]*)\}/g, "$1");
    if (output === prev) break;
  }

  return output
    .replace(/\\%/g, "%")
    .replace(/\\_/g, "_")
    .replace(/\\&/g, "&")
    .replace(/\\#/g, "#")
    .replace(/\\\{/g, "{")
    .replace(/\\\}/g, "}")
    .replace(/\\\$/g, "$");
};

const convertLatexLists = (value: string) => {
  const lines = value.split("\n");
  const result: string[] = [];
  const envStack: Array<"itemize" | "enumerate"> = [];
  const counters: number[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (/^\\begin\{itemize\}/.test(trimmed)) {
      envStack.push("itemize");
      counters.push(0);
      continue;
    }
    if (/^\\begin\{enumerate\}/.test(trimmed)) {
      envStack.push("enumerate");
      counters.push(0);
      continue;
    }
    if (/^\\end\{itemize\}|^\\end\{enumerate\}/.test(trimmed)) {
      envStack.pop();
      counters.pop();
      result.push("");
      continue;
    }

    const itemMatch = line.match(/^\s*\\item(?:\[[^\]]*\])?\s*(.*)$/);
    if (itemMatch) {
      const depth = Math.max(envStack.length - 1, 0);
      const top = envStack[envStack.length - 1];
      if (top === "enumerate") {
        counters[counters.length - 1] += 1;
      }
      const bullet = top === "enumerate" ? `${counters[counters.length - 1]}.` : "-";
      const text = normalizeInlineLatexFormatting(itemMatch[1] || "");
      result.push(`${"  ".repeat(depth)}${bullet} ${text}`.trimEnd());
      continue;
    }

    if (envStack.length > 0 && trimmed.length > 0 && !trimmed.startsWith("\\")) {
      result.push(`${"  ".repeat(envStack.length)}${normalizeInlineLatexFormatting(trimmed)}`);
      continue;
    }

    result.push(line);
  }

  return result.join("\n");
};

const extractCommandArgument = (source: string, command: string): string | null => {
  const marker = `\\${command}{`;
  const start = source.indexOf(marker);
  if (start === -1) return null;

  let index = start + marker.length;
  let depth = 1;
  let output = "";

  while (index < source.length && depth > 0) {
    const char = source[index];
    if (char === "{") {
      depth += 1;
      if (depth > 1) output += char;
      index += 1;
      continue;
    }
    if (char === "}") {
      depth -= 1;
      if (depth > 0) output += char;
      index += 1;
      continue;
    }
    output += char;
    index += 1;
  }

  return output.trim() || null;
};

const preprocessLatexDocument = (value: string) => {
  let source = stripLatexComments((value || "").replace(/\r\n/g, "\n"));

  for (let i = 0; i < 6; i += 1) {
    const prev = source;
    source = source
      .replace(
        /\\(title|section\*?|subsection\*?|subsubsection\*?)\{\s*\\textbf\{([\s\S]*?)\}\s*\}/g,
        "\\$1{$2}"
      )
      .replace(
        /\\(title|section\*?|subsection\*?|subsubsection\*?)\{\s*\\emph\{([\s\S]*?)\}\s*\}/g,
        "\\$1{$2}"
      );
    if (source === prev) break;
  }

  const hasLatexStructure = /\\documentclass|\\begin\{document\}|\\section\*?\{|\\subsection\*?\{|\\begin\{abstract\}/.test(source);
  if (!hasLatexStructure) return normalizeInlineLatexFormatting(source);

  const bodyMatch = source.match(/\\begin\{document\}([\s\S]*?)\\end\{document\}/);
  if (bodyMatch?.[1]) {
    source = bodyMatch[1];
  }

  let title = "";
  const titleValue = extractCommandArgument(value || "", "title");
  if (titleValue) {
    title = normalizeInlineLatexFormatting(titleValue).trim();
  }

  source = source.replace(/^\\(?:documentclass|usepackage|titleformat|author|date|title|newcommand|renewcommand|setlength)\b.*$/gm, "");
  source = source.replace(/\\maketitle/g, "");
  source = source.replace(/\\tableofcontents/g, "");

  source = source.replace(/\\begin\{abstract\}([\s\S]*?)\\end\{abstract\}/g, (_, content: string) => {
    const text = normalizeInlineLatexFormatting(content)
      .trim()
      .replace(/\n{2,}/g, "\n")
      .split("\n")
      .map((line) => `> ${line.trim()}`)
      .join("\n");
    return `${text}\n\n`;
  });
  source = source.replace(/\\begin\{quote\}([\s\S]*?)\\end\{quote\}/g, (_, content: string) => {
    const text = normalizeInlineLatexFormatting(content)
      .trim()
      .replace(/\n{2,}/g, "\n")
      .split("\n")
      .map((line) => `> ${line.trim()}`)
      .join("\n");
    return `${text}\n\n`;
  });
  source = source.replace(/\\begin\{(?:center|flushleft|flushright)\}([\s\S]*?)\\end\{(?:center|flushleft|flushright)\}/g, "$1");

  source = source.replace(
    /\\subsubsection\*?\{([\s\S]*?)\}/g,
    (_, heading: string) => `\n\n#### ${normalizeInlineLatexFormatting(heading).trim()}\n\n`
  );
  source = source.replace(
    /\\subsection\*?\{([\s\S]*?)\}/g,
    (_, heading: string) => `\n\n### ${normalizeInlineLatexFormatting(heading).trim()}\n\n`
  );
  source = source.replace(
    /\\section\*?\{([\s\S]*?)\}/g,
    (_, heading: string) => `\n\n## ${normalizeInlineLatexFormatting(heading).trim()}\n\n`
  );
  source = source.replace(
    /\\paragraph\*?\{([\s\S]*?)\}/g,
    (_, heading: string) => `\n\n#### ${normalizeInlineLatexFormatting(heading).trim()}\n\n`
  );
  source = source.replace(
    /\\subparagraph\*?\{([\s\S]*?)\}/g,
    (_, heading: string) => `\n\n##### ${normalizeInlineLatexFormatting(heading).trim()}\n\n`
  );

  source = convertLatexLists(source);
  source = source.replace(/\\\\/g, "\n");
  source = source.replace(/\\(?:label|ref|cite)\{([^{}]*)\}/g, "$1");
  source = source.replace(/\\footnote\{([^{}]*)\}/g, " ($1)");
  source = source.replace(/^\\(?:begin|end)\{[^}]+\}\s*$/gm, "");
  source = normalizeInlineLatexFormatting(source);
  source = source.replace(/\n{3,}/g, "\n\n").trim();

  if (title && !source.startsWith("# ")) {
    return `# ${title}\n\n${source}`.trim();
  }
  return source;
};

export const renderMarkdown = async (markdown: string) => {
  const toc: TocItem[] = [];
  const slugger = new GithubSlugger();
  const source = markdown || "";

  const processor = unified().use(remarkParse).use(remarkGfm);

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

  processor.use(rehypeSanitize, baseSchema).use(rehypeStringify);

  const file = await processor.process(source);
  return { html: String(file), toc };
};

export const renderLatexDocument = async (latex: string) => {
  const normalized = preprocessLatexDocument(latex || "");
  return renderMarkdown(normalized);
};

type PlainTextRenderOptions = {
  title?: string | null;
};

const tokenizeTitle = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2);

const looksLikeSameTitle = (candidate: string, title?: string | null) => {
  if (!title) return false;
  const candidateTokens = new Set(tokenizeTitle(candidate));
  const titleTokens = tokenizeTitle(title);
  if (candidateTokens.size === 0 || titleTokens.length === 0) return false;

  const matches = titleTokens.filter((token) => candidateTokens.has(token)).length;
  return matches / Math.min(candidateTokens.size, titleTokens.length) >= 0.55;
};

const isShortBlock = (value: string) => value.split(/\s+/).filter(Boolean).length <= 18;

const isLikelyHeading = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed || trimmed.includes("\n") || trimmed.length > 95) return false;
  if (/^step\s+\d+\b/i.test(trimmed)) return true;
  if (/^(faqs?|conclusion)$/i.test(trimmed)) return true;
  if (/^(quick answer|why |what |who |manual |common |a faster |supported |know |transcribing |basic |hybrid )/i.test(trimmed)) {
    return true;
  }
  if (/[.!]$/.test(trimmed)) return false;

  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length < 3 || words.length > 12) return false;
  const titledWords = words.filter((word) => /^[A-Z0-9“"(\-]/.test(word));
  return titledWords.length / words.length >= 0.6;
};

const headingLevelFor = (value: string, previousHeadingLevel: number) => {
  if (/^step\s+\d+\b/i.test(value)) return 3;
  if (/^(supported |know |transcribing |basic |hybrid )/i.test(value) && previousHeadingLevel >= 2) {
    return 3;
  }
  return 2;
};

const shouldEndGeneratedList = (value: string) =>
  /^(the key|the cleaner|the first|the frustration|understanding|this gives|this is|this step|the goal|real-time|this dramatically|think of|instead of|that’s|that's|let’s|let's|this hybrid|remember|if you|we’re|we're|fast\.?$|yes\.?$|no\.?$|however|because|accuracy depends)/i.test(
    value
  );

const hasMarkdownStructure = (value: string) =>
  /(^|\n)#{2,6}\s+\S/.test(value) ||
  /(^|\n)(?:-|\*)\s+\S/.test(value) ||
  /(^|\n)\d+\.\s+\S/.test(value) ||
  /\[[^\]]+\]\([^)]+\)/.test(value);

const renderPlainTextAsMarkdown = (text: string, options: PlainTextRenderOptions = {}) => {
  const blocks = text
    .replace(/\r\n/g, "\n")
    .trim()
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  const units = blocks.flatMap((block) => {
    const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
    if (lines.length > 1 && lines.every((line) => isShortBlock(line))) {
      return lines;
    }
    return [block];
  });

  const output: string[] = [];
  let previousHeadingLevel = 0;
  let listMode = false;

  units.forEach((unit, index) => {
    if (index === 0 && looksLikeSameTitle(unit, options.title)) {
      listMode = false;
      return;
    }

    const escaped = unit.replace(/\n/g, " ").replace(/\s+/g, " ").trim();
    if (!escaped) return;

    if (isLikelyHeading(escaped)) {
      const level = headingLevelFor(escaped, previousHeadingLevel);
      output.push(`${"#".repeat(level)} ${escaped}`);
      previousHeadingLevel = level;
      listMode = false;
      return;
    }

    if (listMode && isShortBlock(escaped) && !shouldEndGeneratedList(escaped)) {
      output.push(`- ${escaped}`);
      return;
    }

    output.push(escaped);
    listMode = /:$/.test(escaped);
  });

  return output.join("\n\n").replace(/(- [^\n]+)\n\n(?=- )/g, "$1\n");
};

export const renderPlainText = async (text: string, options: PlainTextRenderOptions = {}) => {
  const normalized = (text || "").replace(/\r\n/g, "\n").trim();
  if (!normalized) {
    return { html: "", toc: [] as TocItem[] };
  }

  if (hasMarkdownStructure(normalized)) {
    return renderMarkdown(normalized);
  }

  return renderMarkdown(renderPlainTextAsMarkdown(normalized, options));
};

export type { TocItem };
