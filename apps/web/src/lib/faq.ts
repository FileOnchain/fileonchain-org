/**
 * Home-page FAQ content. Single source of truth for both the visible
 * `FaqAccordion` and the `FAQPage` JSON-LD emitted alongside it — keep them in
 * sync by editing here only.
 */
export const FAQ = [
  {
    q: "What is an evidence package?",
    a: "A portable JSON envelope bundling a subject's SHA-256 digest, provenance claims (run id, agent id, tool calls, approvals), the signatures of whoever — or whatever — produced and assembled it, and storage and settlement receipts from public systems. It travels as a file: paste it into the /verify page or run the open-source CLI (fileonchain verify evidence.json) and it validates locally, without calling FileOnChain.",
  },
  {
    q: "Is this an AI observability platform?",
    a: "No. FileOnChain complements tracing systems like OpenTelemetry, Langfuse, and LangSmith rather than replacing them: it seals evidence about a run — hashing and referencing traces, outputs, and approvals — into a tamper-evident, portable envelope. Your observability stack stays the system of record for debugging; the evidence package is what you hand to someone who needs independent proof.",
  },
  {
    q: "Do I need a token?",
    a: "No. There is no token anywhere in v1 — no staking, no tips, no governance. Anchoring costs each chain's ordinary transaction fee, and hosted anchoring is paid with account credits (fiat or USDC).",
  },
  {
    q: "Are my files stored on-chain?",
    a: "Only if you choose that. The default mode is evidence-only: hash, signatures, and timestamp — your bytes never leave your custody, which is the right default for agent logs and anything sensitive. You can opt into permanent on-chain storage (Autonomys is the suggested home) or link an external copy you host; either way the package stays verifiable because integrity is bound to hashes, not locations.",
  },
  {
    q: "What does anchoring on several chains actually prove?",
    a: "Each anchor is an independent, chain-native receipt saying this hash existed at this time on this system — portable evidence that survives any one chain becoming unavailable. It is not a cross-chain proof: no chain verifies another chain's consensus, and we deliberately never claim otherwise.",
  },
  {
    q: "What does the donation flow do?",
    a: "Donations fund the public cache layer: a free, slow-tier pin that keeps important public files (research data, archives, open-source releases) retrievable for everyone. 100% of donations are routed to cache node operators via the DonationEscrow contract.",
  },
  {
    q: "How does paid private cache differ from free public cache?",
    a: "Paid cache is encrypted client-side with a key only you (and your sharees) hold. The cache node never sees the bytes in plaintext — it just stores ciphertext for the duration you paid. Public cache is unencrypted and free, intended for non-sensitive archives. Note that losing your encryption key makes encrypted permanent data unrecoverable.",
  },
] as const;
