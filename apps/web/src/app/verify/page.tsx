import type { Metadata } from "next";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import VerifyPanel from "@/components/verify/VerifyPanel";
import { siteConfig } from "@/lib/site";

/**
 * /verify — public, in-browser verification of an evidence package. No
 * account, no wallet: the verifier runs locally (dynamic-imported inside
 * the client panel so viem stays out of the initial bundle), and the
 * optional online pass talks only to public RPC endpoints.
 *
 * Server component so the metadata can depend on the link parameters:
 * a `/verify?url=` or `?envelope=` link gets a social card rendered by
 * `/api/og/verify` from the verifier's own result, so the status a
 * reader sees in a timeline is the status the verifier computed. The
 * panel itself reads the same parameters from `window.location` once on
 * mount (see `VerifyPanel`).
 */

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

const first = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

const DESCRIPTION =
  "Check an evidence package locally — subject integrity, artifact and envelope signatures, receipts, key status. No account required.";

export async function generateMetadata({
  searchParams,
}: {
  searchParams: SearchParams;
}): Promise<Metadata> {
  const params = await searchParams;
  const url = first(params.url);
  const envelope = first(params.envelope);
  const linked: Record<string, string> | null = url ? { url } : envelope ? { envelope } : null;

  const base: Metadata = {
    title: "Verify",
    description:
      "Verify a FileOnChain evidence package in your browser — no account, no wallet. Paste the envelope JSON, optionally supply the original bytes, and get the full check-by-check report: subject integrity, signatures, receipts, key status.",
    alternates: { canonical: "/verify" },
    openGraph: {
      title: "Verify · FileOnChain",
      description: DESCRIPTION,
      url: "/verify",
      type: "website",
    },
    // Without this, the root layout's twitter block (homepage copy) is
    // inherited wholesale — metadata merges shallowly per top-level key.
    twitter: {
      card: "summary_large_image",
      title: "Verify · FileOnChain",
      description: DESCRIPTION,
    },
  };
  if (!linked) return base;

  const query = new URLSearchParams(linked).toString();
  const image = {
    url: `${siteConfig.url}/api/og/verify?${query}`,
    width: 1200,
    height: 630,
    alt: "FileOnChain evidence report",
  };
  const title = "Evidence report · FileOnChain";
  const description =
    "Open verifier result for a linked evidence envelope — status, artifact and envelope signatures, receipts, settlement systems. Reproduce it in your browser.";
  return {
    ...base,
    title: "Evidence report",
    description,
    // A linked report is a distinct share target, but the canonical page
    // stays /verify so the parameterized copies don't compete in search.
    openGraph: { ...base.openGraph, title, description, url: `/verify?${query}`, images: [image] },
    twitter: { ...base.twitter, title, description, images: [image.url] },
    robots: { index: false, follow: true },
  };
}

export default function VerifyPage() {
  return (
    <PageShell size="wide" padding="lg" atmosphere>
      <PageHeader
        className="mb-8"
        index="09"
        kicker="Verify"
        title="Verify an evidence package"
        lede="Try a sample, paste an envelope, or drop the .json file — every check runs in your browser: subject integrity, artifact and envelope signatures, receipts, key status. Supply the original bytes to prove integrity end-to-end; tick the online option to confirm settlement receipts against public RPCs. Nothing is uploaded to FileOnChain."
      />
      <VerifyPanel />
    </PageShell>
  );
}
