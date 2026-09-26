import * as React from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FiArrowLeft } from "react-icons/fi";
import { PageShell } from "@/components/layout/PageShell";
import PostBody from "@/components/blog/PostBody";
import PostMeta from "@/components/blog/PostMeta";
import { loadPost, loadPosts } from "@/lib/blog/load";
import { pageMetadata } from "@/lib/seo";
import { siteConfig } from "@/lib/site";

/** Every post is prerendered; an unknown slug is a 404, not a runtime render. */
export const dynamicParams = false;

export async function generateStaticParams(): Promise<{ slug: string }[]> {
  return (await loadPosts()).map((post) => ({ slug: post.slug }));
}

interface PostPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PostPageProps): Promise<Metadata> {
  const post = await loadPost((await params).slug);
  if (!post) return {};
  const base = pageMetadata({
    title: post.title,
    description: post.description,
    path: `/blog/${post.slug}`,
    ogType: "article",
    index: !post.draft,
  });
  return {
    ...base,
    authors: [{ name: post.author }],
    openGraph: {
      ...base.openGraph,
      type: "article",
      publishedTime: post.date,
      ...(post.updated ? { modifiedTime: post.updated } : {}),
      authors: [post.author],
      tags: post.tags,
    },
    alternates: {
      ...base.alternates,
      types: { "application/rss+xml": "/blog/feed.xml" },
    },
  };
}

const BlogPostPage = async ({ params }: PostPageProps) => {
  const post = await loadPost((await params).slug);
  if (!post) notFound();

  const url = `${siteConfig.url}/blog/${post.slug}`;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.description,
    datePublished: post.date,
    dateModified: post.updated ?? post.date,
    author: { "@type": "Person", name: post.author },
    publisher: { "@type": "Organization", name: siteConfig.name, url: siteConfig.url },
    mainEntityOfPage: url,
    url,
    ...(post.tags.length ? { keywords: post.tags.join(", ") } : {}),
  };

  return (
    <PageShell size="narrow" padding="lg" atmosphere>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <article>
        <Link
          href="/blog"
          className="inline-flex items-center gap-1.5 font-mono text-xs uppercase tracking-[0.18em] text-muted transition-colors duration-base hover:text-primary"
        >
          <FiArrowLeft size={12} aria-hidden />
          Blog
        </Link>
        <header className="mt-6 border-b border-border pb-8">
          <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">{post.title}</h1>
          <p className="mt-4 text-lg leading-relaxed text-muted">{post.description}</p>
          <div className="mt-5">
            <PostMeta post={post} showAuthor />
          </div>
        </header>
        <PostBody blocks={post.blocks} />
      </article>
    </PageShell>
  );
};

export default BlogPostPage;
