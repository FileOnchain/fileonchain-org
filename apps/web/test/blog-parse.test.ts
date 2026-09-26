import { describe, expect, it } from "vitest";
import {
  blocksToHtml,
  parseBlocks,
  parsePost,
  sortPosts,
  splitFrontmatter,
  tokenizeInline,
} from "@/lib/blog/parse";

const SITE = "https://fileonchain.org";

const POST = `---
title: "Why envelopes are portable"
description: A short summary.
date: 2026-10-01
tags: [protocol, verifier]
---

Intro paragraph that
spans two lines.

## Section one

- first item
  continues here
- second item

1. ordered

> quoted line
>
> second quote paragraph

\`\`\`ts
const x = 1;

const y = 2;
\`\`\`

![Diagram](/blog/diagram.png)

---

## Section one
`;

describe("splitFrontmatter", () => {
  it("reads key/value pairs and strips quotes", () => {
    const { fields, body } = splitFrontmatter(POST);
    expect(fields.title).toBe("Why envelopes are portable");
    expect(fields.date).toBe("2026-10-01");
    expect(body.trimStart().startsWith("Intro paragraph")).toBe(true);
  });

  it("treats a file without frontmatter as all body", () => {
    expect(splitFrontmatter("# Hi").fields).toEqual({});
  });
});

describe("parsePost", () => {
  it("parses frontmatter, defaults, and blocks", () => {
    const post = parsePost("why-envelopes", POST);
    expect(post).toMatchObject({
      slug: "why-envelopes",
      title: "Why envelopes are portable",
      date: "2026-10-01",
      updated: null,
      author: "Marc-Aurèle Besner",
      tags: ["protocol", "verifier"],
      draft: false,
      readingMinutes: 1,
    });
    expect(post.blocks.map((b) => b.kind)).toEqual([
      "paragraph",
      "heading",
      "list",
      "list",
      "quote",
      "code",
      "image",
      "rule",
      "heading",
    ]);
    expect(post.blocks[0]).toEqual({ kind: "paragraph", text: "Intro paragraph that spans two lines." });
    expect(post.blocks[2]).toEqual({ kind: "list", ordered: false, items: ["first item continues here", "second item"] });
    expect(post.blocks[4]).toEqual({ kind: "quote", paragraphs: ["quoted line", "second quote paragraph"] });
    expect(post.blocks[5]).toEqual({ kind: "code", language: "ts", code: "const x = 1;\n\nconst y = 2;" });
  });

  it("de-duplicates heading anchors", () => {
    const ids = parsePost("p", POST).blocks.flatMap((b) => (b.kind === "heading" ? [b.id] : []));
    expect(ids).toEqual(["section-one", "section-one-1"]);
  });

  it("rejects missing fields and bad slugs, naming the post", () => {
    expect(() => parsePost("p", "---\ntitle: T\ndate: 2026-10-01\n---\n")).toThrow(/"p".*description/);
    expect(() => parsePost("p", "---\ntitle: T\ndescription: D\ndate: Oct 1\n---\n")).toThrow(/YYYY-MM-DD/);
    expect(() => parsePost("Bad_Slug", POST)).toThrow(/lowercase/);
  });

  it("reads the draft flag", () => {
    expect(parsePost("p", POST.replace("tags:", "draft: true\ntags:")).draft).toBe(true);
  });
});

describe("parseBlocks", () => {
  it("demotes a stray h1 to h2", () => {
    expect(parseBlocks("# Title")[0]).toMatchObject({ kind: "heading", level: 2 });
  });
});

describe("tokenizeInline", () => {
  it("tokenizes code, links, bold, and italic", () => {
    expect(tokenizeInline("a `b` [c](/d) **e** *f* _g_ snake_case_name")).toEqual([
      { kind: "text", value: "a " },
      { kind: "code", value: "b" },
      { kind: "text", value: " " },
      { kind: "link", value: "c", href: "/d" },
      { kind: "text", value: " " },
      { kind: "strong", value: "e" },
      { kind: "text", value: " " },
      { kind: "em", value: "f" },
      { kind: "text", value: " " },
      { kind: "em", value: "g" },
      { kind: "text", value: " snake_case_name" },
    ]);
  });
});

describe("blocksToHtml", () => {
  it("escapes text and absolutizes site-relative URLs", () => {
    const html = blocksToHtml(parseBlocks("[x](/verify) <b>\n\n![a](/i.png)"), SITE);
    expect(html).toBe(
      `<p><a href="${SITE}/verify">x</a> &lt;b&gt;</p><p><img src="${SITE}/i.png" alt="a" /></p>`,
    );
  });
});

describe("sortPosts", () => {
  it("orders newest first with a stable tie-break", () => {
    const make = (slug: string, date: string) => parsePost(slug, `---\ntitle: T\ndescription: D\ndate: ${date}\n---\n`);
    const sorted = sortPosts([make("b", "2026-01-01"), make("a", "2026-01-01"), make("c", "2026-02-01")]);
    expect(sorted.map((p) => p.slug)).toEqual(["c", "a", "b"]);
  });
});
