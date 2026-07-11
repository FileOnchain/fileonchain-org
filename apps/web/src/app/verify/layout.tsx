import type { Metadata } from "next";

// The verify page is a Client Component (file readers, dynamic import of the
// verifier); its metadata lives here — same pattern as /explorer.
export const metadata: Metadata = {
  title: "Verify",
  description:
    "Verify a FileOnChain evidence package in your browser — no account, no wallet. Paste the envelope JSON, optionally supply the original bytes, and get the full check-by-check report: subject integrity, signatures, receipts, key status.",
  alternates: { canonical: "/verify" },
  openGraph: {
    title: "Verify · FileOnChain",
    description:
      "Check an evidence package locally — subject integrity, artifact and envelope signatures, receipts, key status. No account required.",
    url: "/verify",
    type: "website",
  },
  // Without this, the root layout's twitter block (homepage copy) is
  // inherited wholesale — metadata merges shallowly per top-level key.
  twitter: {
    card: "summary_large_image",
    title: "Verify · FileOnChain",
    description:
      "Check an evidence package locally — subject integrity, artifact and envelope signatures, receipts, key status. No account required.",
  },
};

export default function VerifyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
