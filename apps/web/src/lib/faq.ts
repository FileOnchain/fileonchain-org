/**
 * Home-page FAQ content. Single source of truth for both the visible
 * `FaqAccordion` and the `FAQPage` JSON-LD emitted alongside it — keep them in
 * sync by editing here only.
 */
export const FAQ = [
  {
    q: "What file types can I upload?",
    a: "Anything that fits in a browser file input — images, video, JSON, text, binaries. We do not parse or restrict content. Files are split into chunks sized to the storage chain's per-transaction data budget, so any file can ride any storage-capable chain.",
  },
  {
    q: "Where are the bytes actually stored?",
    a: "On-chain, by default: chunk bytes are embedded in the anchor transactions on the storage chain you pick — the anchoring chain itself when it can carry them, or Autonomys, the permanent-storage network suggested for larger files. You can also opt out and anchor proof-only, optionally pointing the anchor at a copy you host elsewhere (IPFS, Auto Drive, any URI). Paid cache nodes can additionally pin encrypted chunks for fast retrieval.",
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
