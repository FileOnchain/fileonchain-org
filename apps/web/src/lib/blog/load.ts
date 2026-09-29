import "server-only";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { parsePost, sortPosts, type BlogPost } from "@/lib/blog/parse";

/**
 * Blog posts live as `apps/web/content/blog/<slug>.md` (`process.cwd()` is
 * `apps/web` both locally and on Vercel). Read at build time by the static
 * `/blog` pages, the feed, and the sitemap; `outputFileTracingIncludes` in
 * `next.config.ts` keeps the folder reachable from the server functions.
 * `README.md` and files starting with `_` are not posts.
 */
export const BLOG_DIR = path.resolve(process.cwd(), "content", "blog");

const isPostFile = (name: string): boolean =>
  name.endsWith(".md") && name !== "README.md" && !name.startsWith("_");

/** Drafts are listed in development only, so an author can preview them. */
const showDrafts = process.env.NODE_ENV !== "production";

export const loadPosts = async (): Promise<BlogPost[]> => {
  let names: string[];
  try {
    names = (await readdir(BLOG_DIR)).filter(isPostFile);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const posts = await Promise.all(
    names.map(async (name) =>
      parsePost(name.slice(0, -".md".length), await readFile(path.join(BLOG_DIR, name), "utf8")),
    ),
  );
  return sortPosts(posts.filter((post) => showDrafts || !post.draft));
};

export const loadPost = async (slug: string): Promise<BlogPost | null> =>
  (await loadPosts()).find((post) => post.slug === slug) ?? null;
