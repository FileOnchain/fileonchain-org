import * as React from "react";
import Badge from "@/components/ui/Badge";
import { tokenizeInline, type ChangelogRelease as Release } from "@/lib/changelog/parse";
import { siteConfig } from "@/lib/site";

/** Inline markdown (`code`, links, `#123`) to React nodes. */
export const InlineMarkdown = ({ text }: { text: string }) => (
  <>
    {tokenizeInline(text, siteConfig.repo).map((token, i) => {
      switch (token.kind) {
        case "code":
          return (
            <code key={i} className="rounded bg-surface-elevated px-1 py-0.5 font-mono text-[0.85em] text-foreground">
              {token.value}
            </code>
          );
        case "link":
          return (
            <a
              key={i}
              href={token.href}
              target={token.href.startsWith("http") ? "_blank" : undefined}
              rel={token.href.startsWith("http") ? "noopener noreferrer" : undefined}
              className="font-medium text-foreground underline-offset-4 hover:text-primary hover:underline"
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

/**
 * One release of the changelog: a linkable heading (`#<slug>`), the date,
 * any notes, then the area sections as bullet lists. Server component,
 * so the page ships no JS for the log itself.
 */
const ChangelogRelease = ({ release }: { release: Release }) => (
  <article
    id={release.slug}
    className="scroll-mt-24 grid gap-4 border-t border-border py-8 md:grid-cols-[200px_minmax(0,1fr)] md:gap-8"
    aria-labelledby={`release-${release.slug}`}
  >
    <header className="flex flex-row items-baseline gap-3 md:flex-col md:items-start md:gap-2">
      <h2 id={`release-${release.slug}`} className="text-lg font-semibold tracking-tight text-foreground">
        <a href={`#${release.slug}`} className="hover:text-primary">
          {release.unreleased ? "Unreleased" : release.title}
        </a>
      </h2>
      {release.unreleased ? (
        <Badge variant="warning" size="sm">on main</Badge>
      ) : release.date && release.date !== release.title ? (
        <time dateTime={release.date} className="font-mono text-xs text-muted">
          {release.date}
        </time>
      ) : null}
    </header>

    <div className="space-y-5">
      {release.notes.map((note) => (
        <p key={note} className="text-sm leading-relaxed text-muted">
          <InlineMarkdown text={note} />
        </p>
      ))}
      {release.sections.map((section) => (
        <section key={section.title} aria-label={section.title}>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
            {section.title}
          </p>
          <ul className="mt-2 space-y-2">
            {section.items.map((item) => (
              <li key={item} className="flex gap-3 text-sm leading-relaxed text-foreground/90">
                <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/60" />
                <span>
                  <InlineMarkdown text={item} />
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  </article>
);

export default ChangelogRelease;
