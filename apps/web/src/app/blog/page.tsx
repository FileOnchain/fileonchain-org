import * as React from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { FiRss } from "react-icons/fi";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import PostMeta from "@/components/blog/PostMeta";
import { loadPosts } from "@/lib/blog/load";
import { pageMetadata } from "@/lib/seo";

const DESCRIPTION =
  "Notes from building FileOnChain: the Evidence Protocol, the Agent Evidence Profile, the open verifier, and what we learn shipping portable, verifiable evidence.";

const base = pageMetadata({
  title: "Blog",
  description: DESCRIPTION,
  path: "/blog",
});

export const metadata: Metadata = {
  ...base,
  alternates: {
    ...base.alternates,
    types: { "application/rss+xml": "/blog/feed.xml" },
  },
};

const actionLink =
  "inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-surface px-3 text-sm font-medium text-foreground transition-colors duration-base hover:border-primary/50 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";

/**
 * /blog, generated at build time from `apps/web/content/blog/*.md`. Static:
 * a deploy is what publishes a post. The feed at `/blog/feed.xml` is built
 * from the same parse.
 */
const BlogPage = async () => {
  const posts = await loadPosts();
  return (
    <PageShell size="default" padding="lg" atmosphere>
      <PageHeader
        className="mb-6"
        index="12"
        kicker="Blog"
        title="Notes from building FileOnChain"
        lede="Design decisions behind the Evidence Protocol and the Agent Evidence Profile, how the open verifier checks an envelope, and what we learn shipping it. Release-by-release detail stays in the changelog."
        actions={
          <>
            <a href="/blog/feed.xml" data-cta="rss_feed" data-cta-location="blog_header" className={actionLink}>
              <FiRss size={14} aria-hidden />
              RSS feed
            </a>
            <Link href="/changelog" className={actionLink}>
              Changelog
            </Link>
          </>
        }
      />

      {posts.length === 0 ? (
        <section className="mt-10 rounded-2xl border border-dashed border-border bg-surface/60 p-8 text-center">
          <p className="text-base font-semibold text-foreground">No posts yet</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted">
            The first posts are being written. Subscribe to the{" "}
            <a
              href="/blog/feed.xml"
              data-cta="rss_feed"
              data-cta-location="blog_empty"
              className="font-medium text-foreground underline-offset-4 hover:text-primary hover:underline"
            >
              RSS feed
            </a>{" "}
            to hear when they land, or read the{" "}
            <Link
              href="/changelog"
              className="font-medium text-foreground underline-offset-4 hover:text-primary hover:underline"
            >
              changelog
            </Link>{" "}
            in the meantime.
          </p>
        </section>
      ) : (
        <ol className="mt-4">
          {posts.map((post) => (
            <li key={post.slug} className="border-t border-border py-8">
              <article className="grid gap-3 md:grid-cols-[200px_minmax(0,1fr)] md:gap-8">
                <PostMeta post={post} />
                <div>
                  <h2 className="text-xl font-semibold tracking-tight text-foreground">
                    <Link href={`/blog/${post.slug}`} className="hover:text-primary">
                      {post.title}
                    </Link>
                  </h2>
                  <p className="mt-2 text-sm leading-relaxed text-muted">{post.description}</p>
                  {post.tags.length > 0 ? (
                    <ul className="mt-3 flex flex-wrap gap-2" aria-label="Tags">
                      {post.tags.map((tag) => (
                        <li
                          key={tag}
                          className="rounded border border-border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted"
                        >
                          {tag}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              </article>
            </li>
          ))}
        </ol>
      )}
    </PageShell>
  );
};

export default BlogPage;
