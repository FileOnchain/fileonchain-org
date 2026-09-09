"use client";

import * as React from "react";
import { FaNpm } from "react-icons/fa";
import { FiStar } from "react-icons/fi";
import type { SocialProof as SocialProofData } from "@/lib/server/social-proof";
import { siteConfig } from "@/lib/site";

const pill =
  "inline-flex h-7 items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 font-mono text-[11px] text-muted transition-colors duration-base hover:border-primary/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";

/** `1234` -> `1.2k`. */
const compact = (value: number): string =>
  new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value);

/**
 * SocialProof, the footer's usage pills. The star pill is in the static
 * HTML as a plain "Star on GitHub" link; once `/api/social-proof` answers
 * it swaps in the count, and npm pills appear for any package the
 * registry reports. Nothing is shown that was not fetched: a zero or an
 * unreachable source keeps the call-to-action form, and unpublished
 * packages render nothing at all.
 */
const SocialProof = () => {
  const [proof, setProof] = React.useState<SocialProofData | null>(null);

  React.useEffect(() => {
    const controller = new AbortController();
    fetch("/api/social-proof", { signal: controller.signal })
      .then((res) => (res.ok ? (res.json() as Promise<SocialProofData>) : null))
      .then((data) => {
        if (data) setProof(data);
      })
      .catch(() => {
        // Fail open: the static pill stays as the call to action.
      });
    return () => controller.abort();
  }, []);

  const stars = proof?.stars ?? 0;

  return (
    <div className="flex flex-wrap items-center gap-2" aria-label="Public usage signals">
      <a
        href={siteConfig.repo}
        target="_blank"
        rel="noopener noreferrer"
        className={pill}
        aria-label={stars ? `${stars} GitHub stars` : "Star FileOnChain on GitHub"}
      >
        <FiStar size={12} aria-hidden />
        <span>{stars ? `${compact(stars)} stars` : "Star on GitHub"}</span>
      </a>
      {proof?.npm.map(({ name, weeklyDownloads }) => (
        <a
          key={name}
          href={`https://www.npmjs.com/package/${name}`}
          target="_blank"
          rel="noopener noreferrer"
          className={pill}
          aria-label={`${name}: ${weeklyDownloads} npm downloads last week`}
        >
          <FaNpm size={14} aria-hidden />
          <span>
            {name.replace("@fileonchain/", "")} · {compact(weeklyDownloads)}/wk
          </span>
        </a>
      ))}
    </div>
  );
};

export default SocialProof;
