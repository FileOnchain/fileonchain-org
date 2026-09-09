"use client";

import * as React from "react";
import type { VerificationStatus } from "@fileonchain/verify";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { buildEnvelopeShareLink } from "@/lib/verify/samples";
import { buildBadgeMarkdown, buildBadgeUrl, buildUrlShareLink } from "@/lib/verify/share";

/**
 * ShareEvidence — the distribution controls under a report on `/verify`.
 *
 * Two shapes, depending on where the envelope came from:
 *  - loaded from a public URL (`?url=`): a link to this report, the
 *    status badge (`/api/badge?url=`) with a live preview, and the
 *    Markdown that drops the badge into a README or release note with
 *    the report as its click-through. The badge re-verifies on every
 *    fetch, so it tracks the bytes at that URL, not this session.
 *  - pasted, dropped, or from a sample: a `?envelope=` link that carries
 *    the envelope itself, offered only while it fits in a URL.
 *
 * The wording never says "verified": the link and the badge repeat the
 * verifier's status word for word.
 */
export interface ShareEvidenceProps {
  /** The envelope JSON currently in the panel. */
  json: string;
  /** Public URL the envelope was fetched from, when it came from `?url=`. */
  sourceUrl: string | null;
  /** Status of the report being shown. */
  status: VerificationStatus;
}

const origin = () => (typeof window === "undefined" ? "" : window.location.origin);

export const ShareEvidence = ({ json, sourceUrl, status }: ShareEvidenceProps) => {
  const [copied, setCopied] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const copy = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setError(null);
      setCopied(key);
      window.setTimeout(() => setCopied((k) => (k === key ? null : k)), 2000);
    } catch {
      setError("Could not copy — your browser blocked clipboard access.");
    }
  };

  const envelopeLink = React.useMemo(
    () => (sourceUrl ? null : buildEnvelopeShareLink(json, origin())),
    [json, sourceUrl],
  );

  if (sourceUrl) {
    const reportLink = buildUrlShareLink(sourceUrl, origin());
    const badgeUrl = buildBadgeUrl(sourceUrl, origin());
    const markdown = buildBadgeMarkdown(sourceUrl, origin(), status);
    return (
      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Share this report</h3>
            <p className="mt-0.5 text-xs text-muted">
              Anyone opening the link reproduces the verification in their own browser. The
              badge re-checks the envelope at its URL each time it is fetched.
            </p>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element -- dynamic SVG from our own route */}
          <img src={badgeUrl} alt={`FileOnChain evidence badge: ${status}`} height={20} />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button size="sm" variant="secondary" onClick={() => copy("link", reportLink)}>
            {copied === "link" ? "Link copied" : "Copy link"}
          </Button>
          <Button size="sm" variant="secondary" onClick={() => copy("badge", markdown)}>
            {copied === "badge" ? "Markdown copied" : "Copy badge Markdown"}
          </Button>
          {error && <p className="text-xs text-danger">{error}</p>}
        </div>
        <pre className="mt-3 overflow-x-auto rounded-md border border-border bg-surface p-3 font-mono text-[11px] text-muted">
          {markdown}
        </pre>
      </Card>
    );
  }

  if (!envelopeLink) return null;

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Share this report</h3>
          <p className="mt-0.5 text-xs text-muted">
            The link carries the envelope itself; whoever opens it runs the same checks locally.
            Host the envelope at a public URL to get a status badge as well.
          </p>
        </div>
        <Button size="sm" variant="secondary" onClick={() => copy("link", envelopeLink)}>
          {copied === "link" ? "Link copied" : "Copy link"}
        </Button>
      </div>
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
    </Card>
  );
};

export default ShareEvidence;
