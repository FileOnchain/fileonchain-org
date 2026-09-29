/**
 * Parser for blog posts: one Markdown file per post under
 * `apps/web/content/blog/`, with a small frontmatter block. Pure and
 * isomorphic so the `/blog` pages, the RSS route, the sitemap, and the
 * unit tests share one reading of a post. The accepted grammar is
 * deliberately small (`content/blog/README.md` documents it for authors):
 *
 *   ---                        frontmatter: `key: value` lines, with
 *   title: ...                 title, description, and date (YYYY-MM-DD)
 *   ---                        required
 *   ## / ### / ####            section headings (the post title is the h1)
 *   paragraph lines            consecutive lines fold into one paragraph
 *   - item / 1. item           lists; indented lines continue the item
 *   > quote                    blockquote
 *   ```lang ... ```            fenced code block
 *   ![alt](src)                an image on a line of its own
 *   ---                        horizontal rule (after the frontmatter)
 *
 * Inline: `code`, [text](url), **bold**, *italic* / _italic_.
 */

export interface BlogFrontmatter {
  title: string;
  /** Search-snippet summary, also used on the index card and in the feed. */
  description: string;
  /** Publication date, `YYYY-MM-DD`. */
  date: string;
  /** Last meaningful revision, `YYYY-MM-DD`, when there was one. */
  updated: string | null;
  author: string;
  tags: string[];
  /** Drafts render in development only. */
  draft: boolean;
}

export type BlogBlock =
  | { kind: "heading"; level: 2 | 3 | 4; text: string; id: string }
  | { kind: "paragraph"; text: string }
  | { kind: "list"; ordered: boolean; items: string[] }
  | { kind: "quote"; paragraphs: string[] }
  | { kind: "code"; language: string; code: string }
  | { kind: "image"; alt: string; src: string }
  | { kind: "rule" };

export interface BlogPost extends BlogFrontmatter {
  /** URL segment, from the file name: `content/blog/<slug>.md`. */
  slug: string;
  blocks: BlogBlock[];
  /** Rounded up at roughly 220 words a minute. */
  readingMinutes: number;
}

export const DEFAULT_AUTHOR = "Marc-Aurèle Besner";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const isValidPostSlug = (slug: string): boolean => SLUG.test(slug);

export const slugifyHeading = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[`*_]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const unquote = (value: string): string => {
  const v = value.trim();
  return v.length >= 2 && (v[0] === '"' || v[0] === "'") && v[v.length - 1] === v[0] ? v.slice(1, -1) : v;
};

/** Splits `---` frontmatter from the body; keys are lower-cased. */
export const splitFrontmatter = (source: string): { fields: Record<string, string>; body: string } => {
  const lines = source.replace(/^﻿/, "").split(/\r?\n/);
  if (lines[0]?.trim() !== "---") return { fields: {}, body: lines.join("\n") };
  const end = lines.findIndex((line, i) => i > 0 && line.trim() === "---");
  if (end === -1) return { fields: {}, body: lines.join("\n") };
  const fields: Record<string, string> = {};
  for (const line of lines.slice(1, end)) {
    const match = /^([A-Za-z][\w-]*)\s*:\s*(.*)$/.exec(line);
    if (match) fields[match[1].toLowerCase()] = unquote(match[2]);
  }
  return { fields, body: lines.slice(end + 1).join("\n") };
};

const parseFrontmatter = (fields: Record<string, string>, slug: string): BlogFrontmatter => {
  const fail = (message: string): never => {
    throw new Error(`Blog post "${slug}": ${message}`);
  };
  const title = fields.title?.trim() || fail("frontmatter needs a title");
  const description = fields.description?.trim() || fail("frontmatter needs a description");
  const date = fields.date?.trim() ?? "";
  if (!ISO_DATE.test(date)) fail("frontmatter date must be YYYY-MM-DD");
  const updated = fields.updated?.trim() || null;
  if (updated !== null && !ISO_DATE.test(updated)) fail("frontmatter updated must be YYYY-MM-DD");
  const tags = (fields.tags ?? "")
    .replace(/^\[|\]$/g, "")
    .split(",")
    .map((tag) => unquote(tag).trim())
    .filter(Boolean);
  return {
    title,
    description,
    date,
    updated,
    author: fields.author?.trim() || DEFAULT_AUTHOR,
    tags,
    draft: /^(true|yes)$/i.test(fields.draft ?? ""),
  };
};

/** Markdown body to blocks. Heading ids are de-duplicated within a post. */
export const parseBlocks = (body: string): BlogBlock[] => {
  const blocks: BlogBlock[] = [];
  const usedIds = new Map<string, number>();
  const headingId = (text: string): string => {
    const base = slugifyHeading(text) || "section";
    const seen = usedIds.get(base) ?? 0;
    usedIds.set(base, seen + 1);
    return seen === 0 ? base : `${base}-${seen}`;
  };

  const lines = body.split(/\r?\n/);
  let paragraph: string[] = [];
  let list: Extract<BlogBlock, { kind: "list" }> | null = null;
  let quote: string[] | null = null;

  const flush = () => {
    if (paragraph.length) blocks.push({ kind: "paragraph", text: paragraph.join(" ") });
    if (list) blocks.push(list);
    if (quote) {
      const paragraphs = quote
        .join("\n")
        .split(/\n\s*\n/)
        .map((p) => p.replace(/\s*\n\s*/g, " ").trim())
        .filter(Boolean);
      blocks.push({ kind: "quote", paragraphs });
    }
    paragraph = [];
    list = null;
    quote = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].replace(/\s+$/, "");

    const fence = /^(`{3,})\s*([\w+-]*)\s*$/.exec(line);
    if (fence) {
      flush();
      const code: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith(fence[1])) code.push(lines[i++]);
      blocks.push({ kind: "code", language: fence[2].toLowerCase(), code: code.join("\n") });
      continue;
    }

    if (line.trim() === "") {
      // A blank line inside a quote may separate its paragraphs.
      if (quote && lines[i + 1]?.startsWith(">")) {
        quote.push("");
        continue;
      }
      flush();
      continue;
    }

    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      flush();
      const text = heading[2].trim();
      const level = Math.max(2, heading[1].length) as 2 | 3 | 4;
      blocks.push({ kind: "heading", level, text, id: headingId(text) });
      continue;
    }

    if (/^(\*{3,}|-{3,}|_{3,})$/.test(line.trim())) {
      flush();
      blocks.push({ kind: "rule" });
      continue;
    }

    const image = /^!\[([^\]]*)\]\(([^)\s]+)\)$/.exec(line.trim());
    if (image) {
      flush();
      blocks.push({ kind: "image", alt: image[1], src: image[2] });
      continue;
    }

    const quoted = /^>\s?(.*)$/.exec(line);
    if (quoted) {
      if (!quote) {
        flush();
        quote = [];
      }
      quote.push(quoted[1]);
      continue;
    }

    const item = /^([-*+]|\d+[.)])\s+(.*)$/.exec(line);
    if (item) {
      const ordered = /\d/.test(item[1]);
      if (!list || list.ordered !== ordered) {
        flush();
        list = { kind: "list", ordered, items: [] };
      }
      list.items.push(item[2].trim());
      continue;
    }

    const continuation = /^\s{2,}(\S.*)$/.exec(line);
    if (continuation && list) {
      const last = list.items.length - 1;
      list.items[last] = `${list.items[last]} ${continuation[1].trim()}`;
      continue;
    }

    if (list || quote) flush();
    paragraph.push(line.trim());
  }
  flush();
  return blocks;
};

const countWords = (text: string): number => text.split(/\s+/).filter(Boolean).length;

const blockWords = (block: BlogBlock): number => {
  switch (block.kind) {
    case "heading":
    case "paragraph":
      return countWords(block.text);
    case "list":
      return block.items.reduce((sum, item) => sum + countWords(item), 0);
    case "quote":
      return block.paragraphs.reduce((sum, p) => sum + countWords(p), 0);
    case "code":
      return countWords(block.code);
    default:
      return 0;
  }
};

/** A whole post file. Throws, naming the slug, on invalid frontmatter. */
export const parsePost = (slug: string, source: string): BlogPost => {
  if (!isValidPostSlug(slug)) {
    throw new Error(`Blog post "${slug}": file names must be lowercase words joined by hyphens`);
  }
  const { fields, body } = splitFrontmatter(source);
  const frontmatter = parseFrontmatter(fields, slug);
  const blocks = parseBlocks(body);
  const words = blocks.reduce((sum, block) => sum + blockWords(block), 0);
  return { ...frontmatter, slug, blocks, readingMinutes: Math.max(1, Math.ceil(words / 220)) };
};

/** Newest first; the slug breaks ties so the order is stable. */
export const sortPosts = (posts: BlogPost[]): BlogPost[] =>
  [...posts].sort((a, b) => b.date.localeCompare(a.date) || a.slug.localeCompare(b.slug));

/* ------------------------------------------------------------------ */
/* Inline markdown                                                     */
/* ------------------------------------------------------------------ */

export type InlineToken =
  | { kind: "text"; value: string }
  | { kind: "code"; value: string }
  | { kind: "strong"; value: string }
  | { kind: "em"; value: string }
  | { kind: "link"; value: string; href: string };

/** `code`, [text](url), **bold**, *italic* and _italic_; the rest is text. */
export const tokenizeInline = (text: string): InlineToken[] => {
  const tokens: InlineToken[] = [];
  const pushText = (value: string) => {
    if (!value) return;
    const last = tokens[tokens.length - 1];
    if (last?.kind === "text") last.value += value;
    else tokens.push({ kind: "text", value });
  };
  const pattern =
    /`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*|(?<![\w*])\*([^*\s][^*]*)\*(?!\w)|(?<![\w_])_([^_\s][^_]*)_(?!\w)/g;
  let cursor = 0;
  for (const match of text.matchAll(pattern)) {
    const start = match.index ?? 0;
    pushText(text.slice(cursor, start));
    if (match[1] !== undefined) tokens.push({ kind: "code", value: match[1] });
    else if (match[2] !== undefined) tokens.push({ kind: "link", value: match[2], href: match[3] });
    else if (match[4] !== undefined) tokens.push({ kind: "strong", value: match[4] });
    else tokens.push({ kind: "em", value: match[5] ?? match[6] });
    cursor = start + match[0].length;
  }
  pushText(text.slice(cursor));
  return tokens;
};

/** Site-relative links and images resolve against the site origin in the feed. */
const absolutize = (href: string, siteUrl: string): string =>
  href.startsWith("/") && !href.startsWith("//") ? `${siteUrl}${href}` : href;

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

export const inlineToHtml = (text: string, siteUrl: string): string =>
  tokenizeInline(text)
    .map((token) => {
      switch (token.kind) {
        case "code":
          return `<code>${escapeHtml(token.value)}</code>`;
        case "strong":
          return `<strong>${escapeHtml(token.value)}</strong>`;
        case "em":
          return `<em>${escapeHtml(token.value)}</em>`;
        case "link":
          return `<a href="${escapeHtml(absolutize(token.href, siteUrl))}">${escapeHtml(token.value)}</a>`;
        default:
          return escapeHtml(token.value);
      }
    })
    .join("");

/** A whole post body as escaped HTML, for the RSS feed. */
export const blocksToHtml = (blocks: BlogBlock[], siteUrl: string): string =>
  blocks
    .map((block) => {
      switch (block.kind) {
        case "heading":
          return `<h${block.level}>${inlineToHtml(block.text, siteUrl)}</h${block.level}>`;
        case "paragraph":
          return `<p>${inlineToHtml(block.text, siteUrl)}</p>`;
        case "list": {
          const tag = block.ordered ? "ol" : "ul";
          return `<${tag}>${block.items.map((item) => `<li>${inlineToHtml(item, siteUrl)}</li>`).join("")}</${tag}>`;
        }
        case "quote":
          return `<blockquote>${block.paragraphs.map((p) => `<p>${inlineToHtml(p, siteUrl)}</p>`).join("")}</blockquote>`;
        case "code":
          return `<pre><code>${escapeHtml(block.code)}</code></pre>`;
        case "image":
          return `<p><img src="${escapeHtml(absolutize(block.src, siteUrl))}" alt="${escapeHtml(block.alt)}" /></p>`;
        case "rule":
          return "<hr />";
      }
    })
    .join("");
