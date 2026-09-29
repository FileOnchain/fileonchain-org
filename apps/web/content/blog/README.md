# Blog posts

Each post is one Markdown file in this folder, `<slug>.md`, published at
`/blog/<slug>`. The slug is the file name: lowercase words joined by
hyphens (`why-envelopes-are-portable.md`). This README and files starting
with `_` are not posts.

Posts are read at build time (`src/lib/blog/load.ts`), so a deploy is what
publishes one. The index, the post page, the RSS feed (`/blog/feed.xml`),
and the sitemap all come from the same parse (`src/lib/blog/parse.ts`).

## Frontmatter

```markdown
---
title: Why evidence envelopes are portable
description: One or two sentences, about 150 characters. Used for search snippets, link previews, the index card, and the feed.
date: 2026-10-01
updated: 2026-10-15
author: Marc-Aurèle Besner
tags: protocol, verifier
draft: true
---
```

- `title`, `description`, and `date` (`YYYY-MM-DD`) are required; the
  build fails, naming the file, when one is missing or malformed.
- `updated` is optional and feeds `dateModified` and the sitemap.
- `author` defaults to Marc-Aurèle Besner.
- `tags` is a comma-separated list.
- `draft: true` shows the post in `pnpm dev` only. Production builds leave
  it out of the index, the feed, the sitemap, and the static pages.

## Body

The post title is the page's `h1`, so start sections at `##`. Supported:

- `##`, `###`, `####` headings (each gets a linkable anchor)
- paragraphs, `-` and `1.` lists (indent a line to continue an item)
- `> ` blockquotes
- fenced code blocks; `ts`, `js`, `json`, `sh`/`bash`, `yaml`, and `md`
  are syntax highlighted, other languages render plain
- `![alt text](/blog/images/example.png)` on a line of its own; put image
  files under `apps/web/public/blog/`
- `---` horizontal rules
- inline `` `code` ``, `[links](https://example.com)`, `**bold**`,
  `*italic*`

## Wording

Posts follow the language and claims policy in the root `CLAUDE.md`: say
evidence envelope, locally verified evidence, and multi-system settlement
receipts; never claim an envelope proves truth or authorship; never
describe a network beyond its `integrationStatus`.
