<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Adding a blog post

`/blog` lists a post only when the file is `content/blog/<slug>.md` in this app (`apps/web/content/blog/<slug>.md` from the repo root). The index, `/blog/[slug]`, `/blog/feed.xml`, and the sitemap all read that directory at build time through `src/lib/blog/load.ts`. Any other path, including a folder next to the repo root, is ignored, and `/blog` keeps showing **No posts yet**.

1. Create `content/blog/<slug>.md`. The slug is the filename: lowercase words joined by hyphens. `README.md` and names starting with `_` are not posts.
2. Frontmatter requires `title`, `description`, and `date` (`YYYY-MM-DD`). `description` is the subtitle used on the index card, in search snippets, and in the feed — about 150 characters. The build throws, naming the file, if one of those is missing or the date is malformed. Optional: `updated`, `author` (defaults to Marc-Aurèle Besner), `tags` (comma-separated). Do not add `slug` or `excerpt`.
3. Omit `draft`. `draft: true` shows up in `pnpm dev` only. Production leaves it out of the index, the feed, the sitemap, and the static pages.
4. The page title is the `h1`. Start sections at `##`. The grammar is in `content/blog/README.md`.
5. One image per line: `![alt text](/blog/images/<file>.png)`. Save the file at `public/blog/images/<file>.png`. A relative `images/...` path does not resolve on the site.
6. Wording follows the language and claims policy in the repo root `CLAUDE.md`.

`pnpm build` prerenders `/blog` and fails on invalid frontmatter. A deploy is what publishes the post.
