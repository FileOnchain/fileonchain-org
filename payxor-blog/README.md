# PayXor blog drop

This folder is a post for [payxor.xyz/en/blog](https://payxor.xyz/en/blog). It is not a FileOnChain post. `apps/web/content/blog` does not load it, and it will not appear on the FileOnChain site.

The PayXor site source (`payxor/payxor.xyz`, the repository named by the published `@payxor/*` packages) is not available to this automation, so the post could not be committed there.

## Import

Posts on the site are `{ slug, title, date, excerpt, content, author }`. `author` is `PayXor Team`. `content` is the markdown after the frontmatter, starting at the `#` heading. Copy the four files in `images/` to `public/images/blog/` and point each image at `/images/blog/<filename>`.

The live article renderer handles `#`, `##`, `###`, `-` lists, `**bold**`, inline code, links, and fenced code. A line that is only `![alt](src)` is not turned into an image yet. Add that case before this post is published, or the pictures will show up as text.
