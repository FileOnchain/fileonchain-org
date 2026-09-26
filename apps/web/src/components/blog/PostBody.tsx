import * as React from "react";
import CodeBlock from "@/components/docs/CodeBlock";
import type { CodeLanguage } from "@/lib/highlight";
import { tokenizeInline, type BlogBlock } from "@/lib/blog/parse";

/** Fence info strings Shiki can color here; anything else renders plain. */
const CODE_LANGUAGES: Record<string, CodeLanguage> = {
  ts: "ts",
  typescript: "ts",
  js: "ts",
  javascript: "ts",
  json: "json",
  sh: "sh",
  bash: "sh",
  shell: "sh",
  yaml: "yaml",
  yml: "yaml",
  md: "md",
  markdown: "md",
};

const isExternal = (href: string): boolean => /^https?:\/\//.test(href);

const linkClass = "font-medium text-foreground underline underline-offset-4 decoration-primary/40 hover:text-primary";

const Inline = ({ text }: { text: string }) => (
  <>
    {tokenizeInline(text).map((token, i) => {
      switch (token.kind) {
        case "code":
          return (
            <code key={i} className="rounded bg-surface-elevated px-1 py-0.5 font-mono text-[0.85em] text-foreground">
              {token.value}
            </code>
          );
        case "strong":
          return (
            <strong key={i} className="font-semibold text-foreground">
              {token.value}
            </strong>
          );
        case "em":
          return <em key={i}>{token.value}</em>;
        case "link":
          return (
            <a
              key={i}
              href={token.href}
              target={isExternal(token.href) ? "_blank" : undefined}
              rel={isExternal(token.href) ? "noopener noreferrer" : undefined}
              className={linkClass}
            >
              {token.value}
            </a>
          );
        default:
          return <React.Fragment key={i}>{token.value}</React.Fragment>;
      }
    })}
  </>
);

const headingClass: Record<2 | 3 | 4, string> = {
  2: "mt-12 text-2xl font-semibold tracking-tight",
  3: "mt-10 text-xl font-semibold tracking-tight",
  4: "mt-8 text-base font-semibold",
};

const Block = ({ block }: { block: BlogBlock }) => {
  switch (block.kind) {
    case "heading": {
      const Tag = `h${block.level}` as const;
      return (
        <Tag id={block.id} className={`scroll-mt-24 text-foreground ${headingClass[block.level]}`}>
          <a href={`#${block.id}`} className="hover:text-primary">
            <Inline text={block.text} />
          </a>
        </Tag>
      );
    }
    case "paragraph":
      return (
        <p className="mt-5 leading-relaxed">
          <Inline text={block.text} />
        </p>
      );
    case "list": {
      const Tag = block.ordered ? "ol" : "ul";
      return (
        <Tag className={`mt-5 space-y-2 pl-6 leading-relaxed ${block.ordered ? "list-decimal" : "list-disc"} marker:text-primary/60`}>
          {block.items.map((item, i) => (
            <li key={i} className="pl-1">
              <Inline text={item} />
            </li>
          ))}
        </Tag>
      );
    }
    case "quote":
      return (
        <blockquote className="mt-6 space-y-3 border-l-2 border-primary/50 pl-5 italic">
          {block.paragraphs.map((p, i) => (
            <p key={i} className="leading-relaxed">
              <Inline text={p} />
            </p>
          ))}
        </blockquote>
      );
    case "code": {
      const language = CODE_LANGUAGES[block.language];
      if (language) {
        return <CodeBlock code={block.code} language={language} title={block.language} className="mt-6" />;
      }
      return (
        <pre className="mt-6 overflow-x-auto rounded-lg border border-border bg-surface p-4 font-mono text-xs leading-relaxed text-foreground">
          <code>{block.code}</code>
        </pre>
      );
    }
    case "image":
      return (
        // Post images are static files of unknown size; a plain <img> keeps
        // authors free of width/height bookkeeping.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={block.src} alt={block.alt} loading="lazy" className="mt-6 w-full rounded-lg border border-border" />
      );
    case "rule":
      return <hr className="my-10 border-border" />;
  }
};

/**
 * A post's Markdown body as server-rendered HTML. Fenced code goes through
 * the Shiki-backed `CodeBlock`, whose copy button is the only client JS.
 */
const PostBody = ({ blocks }: { blocks: BlogBlock[] }) => (
  <div className="text-[15px] text-foreground/90">
    {blocks.map((block, i) => (
      <Block key={i} block={block} />
    ))}
  </div>
);

export default PostBody;
