import type { Metadata } from "next";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import UploadFileSection from "@/components/upload/UploadFileSection";

// Server page: metadata lives here directly; the upload flow itself is the
// client-only UploadFileSection (same component as the home-page dropzone).
export const metadata: Metadata = {
  title: "Upload a file",
  description:
    "Put any file onchain: it's hashed in your browser and sealed into a portable evidence package. Anchor the hash on the networks you pick; storing the bytes onchain is an optional choice.",
  alternates: { canonical: "/upload-file" },
  openGraph: {
    title: "Upload a file · FileOnChain",
    description:
      "Hash any file in your browser, seal it into an evidence package, and anchor it on the networks you pick. Storage is opt-in — by default only the hash leaves your machine.",
    url: "/upload-file",
    type: "website",
  },
  // Without this, the root layout's twitter block (homepage copy) is
  // inherited wholesale — metadata merges shallowly per top-level key.
  twitter: {
    card: "summary_large_image",
    title: "Upload a file · FileOnChain",
    description:
      "Hash any file in your browser, seal it into an evidence package, and anchor it on the networks you pick. Storage is opt-in — by default only the hash leaves your machine.",
  },
};

/**
 * /upload-file — the standalone home of the core upload flow. Same
 * UploadFileSection the home-page dropzone renders, framed as an interior
 * route so the header nav can link straight to it.
 */
export default function UploadFilePage() {
  return (
    <PageShell size="wide" padding="lg" atmosphere>
      <PageHeader
        className="mb-8"
        index="01"
        kicker="Upload"
        title="Put a file onchain"
        lede="Drop any file — a document, a photo, a dataset, an agent output. It's hashed in your browser and sealed into an evidence package; storing the bytes onchain is an optional choice — by default nothing but the hash leaves your machine."
      />
      <UploadFileSection withHeader={false} />
    </PageShell>
  );
}
