/**
 * Home-page FAQ content. Single source of truth for both the visible
 * `FaqAccordion` and the `FAQPage` JSON-LD emitted alongside it — keep them in
 * sync by editing here only.
 */
export const FAQ = [
  {
    q: "What file types can I anchor?",
    a: "Anything that fits in a browser file input — images, video, JSON, text, binaries. We do not parse or restrict content: the registry writes the content hash, not the bytes. Files larger than ~1GB are chunked so they can fit any supported chain's tx payload.",
  },
  {
    q: "Where are the bytes actually stored?",
    a: "Two places: (1) onchain, the root CID is committed in a registry contract call on the chain you choose; (2) optionally, on a paid cache node that pins the encrypted chunks for the duration you pay for. Anyone can rebuild the file from any number of cache nodes — there is no canonical host.",
  },
  {
    q: "Can I switch chains after anchoring?",
    a: "Yes — re-write the same root CID on a different chain. The CIDs are content-addressed and remain valid forever, so any new chain that reads them can verify the same file. The dashboard shows which chains currently anchor a given CID.",
  },
  {
    q: "What does the donation flow do?",
    a: "Donations fund the public cache layer: a free, slow-tier pin that keeps important public files (research data, archives, open-source releases) retrievable for everyone. 100% of donations are routed to cache node operators via the DonationEscrow contract.",
  },
  {
    q: "How does paid private cache differ from free public cache?",
    a: "Paid cache is encrypted with a key only you (and your sharees) hold. The cache node never sees the bytes in plaintext — it just stores ciphertext for the duration you paid. Public cache is unencrypted and free, intended for non-sensitive archives.",
  },
] as const;
