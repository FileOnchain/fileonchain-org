import * as React from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { FiRss } from "react-icons/fi";
import { PROTOCOL_VERSION } from "@fileonchain/sdk/protocol";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import ChangelogRelease from "@/components/changelog/ChangelogRelease";
import { loadChangelog } from "@/lib/changelog/load";
import { siteConfig } from "@/lib/site";

const DESCRIPTION =
  "What changed in the FileOnChain Evidence Protocol, the Agent Evidence Profile, the reference implementations, and the webapp. Protocol version and conformance fixture changes are called out so integrators can watch them.";

export const metadata: Metadata = {
  title: "Changelog",
  description: DESCRIPTION,
  alternates: {
    canonical: "/changelog",
    types: { "application/rss+xml": "/changelog/feed.xml" },
  },
  openGraph: {
    title: "Changelog · FileOnChain",
    description: DESCRIPTION,
    url: "/changelog",
    type: "website",
  },
  // Without this, the root layout's twitter block (homepage copy) is
  // inherited wholesale; metadata merges shallowly per top-level key.
  twitter: {
    card: "summary_large_image",
    title: "Changelog · FileOnChain",
    description: DESCRIPTION,
  },
};

const FIXTURES_URL = `${siteConfig.repo}/tree/main/packages/protocol/fixtures`;
const CHANGELOG_URL = `${siteConfig.repo}/blob/main/CHANGELOG.md`;

const actionLink =
  "inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-surface px-3 text-sm font-medium text-foreground transition-colors duration-base hover:border-primary/50 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";

/**
 * /changelog, generated at build time from the repository `CHANGELOG.md`.
 * Static: the file is read once per build, so a deploy is what publishes
 * a new entry. The RSS feed at `/changelog/feed.xml` is built from the
 * same parse.
 */
const ChangelogPage = async () => {
  const { releases } = await loadChangelog();
  return (
    <PageShell size="default" padding="lg" atmosphere>
      <PageHeader
        className="mb-6"
        index="11"
        kicker="Changelog"
        title="What changed, and when"
        lede="Every release of the protocol, the profile, the verifier, the SDKs, the Cloud, and this site, newest first. Entries that change the protocol's canonical bytes say so and name the regenerated conformance fixtures, so an integrator can watch this page or its feed."
        actions={
          <>
            <a href="/changelog/feed.xml" className={actionLink}>
              <FiRss size={14} aria-hidden />
              RSS feed
            </a>
            <a href={CHANGELOG_URL} target="_blank" rel="noopener noreferrer" className={actionLink}>
              Source on GitHub
            </a>
          </>
        }
      />

      {/* What an integrator pins against ------------------------------ */}
      <dl className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-border bg-surface p-4">
          <dt className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
            Protocol version
          </dt>
          <dd className="mt-1 font-mono text-lg font-semibold text-foreground">v{PROTOCOL_VERSION}</dd>
          <dd className="mt-1 text-xs text-muted">
            The <code className="font-mono">version</code> every envelope carries.{" "}
            <Link href="/protocol" className="underline-offset-4 hover:text-foreground hover:underline">
              Protocol page
            </Link>
          </dd>
        </div>
        <div className="rounded-lg border border-border bg-surface p-4">
          <dt className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
            Conformance fixtures
          </dt>
          <dd className="mt-1 text-sm font-semibold text-foreground">Deterministic</dd>
          <dd className="mt-1 text-xs text-muted">
            A fixture diff means the protocol&apos;s bytes changed.{" "}
            <a
              href={FIXTURES_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="underline-offset-4 hover:text-foreground hover:underline"
            >
              Browse fixtures
            </a>
          </dd>
        </div>
        <div className="rounded-lg border border-border bg-surface p-4">
          <dt className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
            Packages
          </dt>
          <dd className="mt-1 text-sm font-semibold text-foreground">Not on npm yet</dd>
          <dd className="mt-1 text-xs text-muted">
            Install from the monorepo for now.{" "}
            <Link href="/docs" className="underline-offset-4 hover:text-foreground hover:underline">
              SDK documentation
            </Link>
          </dd>
        </div>
      </dl>

      <div>
        {releases.map((release) => (
          <ChangelogRelease key={release.slug} release={release} />
        ))}
      </div>

      <section className="mt-12 rounded-2xl border border-dashed border-border bg-surface/60 p-5 text-sm text-muted">
        <p>
          This page is generated from{" "}
          <a
            href={CHANGELOG_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-foreground underline-offset-4 hover:text-primary hover:underline"
          >
            CHANGELOG.md
          </a>{" "}
          in the repository at build time. Subscribe to the{" "}
          <a
            href="/changelog/feed.xml"
            className="font-medium text-foreground underline-offset-4 hover:text-primary hover:underline"
          >
            RSS feed
          </a>{" "}
          to be told when a deploy publishes a new entry.
        </p>
      </section>
    </PageShell>
  );
};

export default ChangelogPage;
