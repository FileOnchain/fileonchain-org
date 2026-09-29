import * as React from "react";
import type { BlogPost } from "@/lib/blog/parse";

const formatDate = (isoDate: string): string =>
  new Date(`${isoDate}T00:00:00Z`).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });

/** Date · reading time · author line shared by the index cards and the post header. */
const PostMeta = ({ post, showAuthor = false }: { post: BlogPost; showAuthor?: boolean }) => (
  <p className="flex flex-wrap content-start items-center gap-x-2 gap-y-1 font-mono text-xs text-muted">
    <time dateTime={post.date}>{formatDate(post.date)}</time>
    <span aria-hidden>·</span>
    <span>{post.readingMinutes} min read</span>
    {showAuthor ? (
      <>
        <span aria-hidden>·</span>
        <span>{post.author}</span>
      </>
    ) : null}
    {post.draft ? (
      <span className="rounded border border-warning/30 bg-warning/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-warning">
        Draft
      </span>
    ) : null}
  </p>
);

export default PostMeta;
