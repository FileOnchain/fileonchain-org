# Chain checklist

The definition of done for adding a new chain **or** productionizing an
existing entry (mock → real). Work through it top to bottom; a chain ships
when every box is checked.

- [ ] **Registry entry** — the chain has an entry in
  `packages/utils/src/chains.ts` with every field correct: `id`
  (`family:reference`), `family`, names, `rpcUrl`, explorer URL + tx/address
  paths, `nativeCurrency`, `icon`, `status`, `testnet`, and any family
  extras (`bech32Prefix`, `embedsChunkData`). Both mainnet **and** testnet
  entries exist. No chain data hardcoded anywhere else.
- [ ] **Status** — a new chain lands as `status: "planned"` (listed in the
  UI with a badge, not selectable for upload, rejected by the anchoring
  API). Flip to `"active"` only once the boxes below are checked; retiring
  a chain sets `"deprecated"` (existing anchors stay readable, no new
  uploads).
- [ ] **Icon** — the SVG referenced by the entry's `icon` field exists in
  `apps/web/public/chains/`.
- [ ] **Cost row** — the chain has a seed cost row in
  `apps/web/src/lib/costs.ts` so the upload estimator prices it before the
  live quote path (`apps/web/src/lib/server/costs.ts`) covers the family.
- [ ] **Provisioned** — `isChainProvisioned` (see
  `packages/utils/src/anchor.ts`) returns true via the **right field for the
  family**: `registryContract` (EVM, Starknet), `moduleAddress` (Aptos, Sui,
  NEAR), `palletContract` (Substrate), `memoAnchoring` (Cosmos, TRON,
  Cardano, TON), `hcsTopicId` (Hedera). Solana is always provisioned. Set it
  per the runbook in `docs/deploy/`.
- [ ] **Integration status** — set `integrationStatus` on the entry
  honestly (never above what is actually deployed and verified): a deploy
  moves it to `"testnet-deployed"` / `"mainnet-deployed"`, and only an
  end-to-end QA'd webapp flow justifies `"webapp-integrated"` or above.
- [ ] **PAYG anchor is real on testnet** — a browser-wallet upload on the
  chain's testnet sends real transactions through `apps/web/src/lib/anchor/*`
  (no `ChainNotProvisionedError` fallback to the mock), and the anchor
  payload parses with `parseAnchorPayload`.
- [ ] **Server worker is real** — the family's signer env var(s) from
  `apps/web/.env.example` are set and funded, and a credits/BYOK upload
  through `anchor-worker.ts` produces a real tx (not the deterministic mock)
  on the testnet.
- [ ] **Wallet auth** — sign-in-with-wallet works for the family
  (`verify-wallet.ts` + `useWalletProof`), **or** the family is explicitly
  documented as anchor-only (server signer, no browser wallet).
- [ ] **Explorer links resolve** — `buildTxUrl` / `buildAddressUrl` produce
  working links for a real tx and the signer address on both networks.
- [ ] **Runbook updated** — the chain's runbook in `docs/deploy/` reflects
  what was actually deployed (addresses, gotchas, command changes).
- [ ] **Copy review** — walk the list below. Every surface that states a
  network count, names live networks, or describes fees must still match
  the registry after the status change.
- [ ] **`pnpm build` is green** — run from the repo root after all edits;
  it typechecks and lints the SDK and webapp.

## Copy that mentions network counts, names, or fees

These surfaces are the first thing a visitor, a crawler, or a social
preview sees. They must never describe a network beyond its
`integrationStatus`, never promise retrieval without naming its
dependency (bytes stored onchain, or the storage history available), and
never mention a registry fee (anchors cost each network's transaction
fee; the registry itself charges nothing). Most derive their numbers from
`ACTIVE_CHAINS` / `ACTIVE_FAMILIES`; re-read the surrounding prose anyway,
because a derived count can still sit inside a stale sentence.

| Surface | What to check |
| --- | --- |
| `apps/web/src/components/onboarding/OnboardingOverlay.tsx` | Network count, mainnet/testnet names, and wallet hints derive from `ACTIVE_CHAINS` / `ACTIVE_FAMILIES`; add the family's wallet to `FAMILY_WALLETS` before flipping it active. |
| `apps/web/src/app/opengraph-image.tsx` | Chain row derives from `ACTIVE_CHAINS`; check the card still fits when the set grows. |
| `apps/web/src/components/ChainsGrid.tsx` | Heading counts `status: "active"` networks only; roadmap adapters are badged, never counted. |
| `apps/web/src/components/HomeContent.tsx` | Closing block: retrieval claims name their dependency; per-network gas, no registry fee. |
| `apps/web/src/app/explorer/layout.tsx` | Page and social descriptions derive live network names from `ACTIVE_CHAINS`. |
| `apps/web/src/lib/faq.ts` | Fee and storage answers (no token, per-network transaction fee, evidence-only default). |
| `apps/web/src/lib/site.ts` | Site-wide descriptions must not name networks or counts. |
| `docs/integrations/status.md` | The human-readable mirror of `integrationStatus`; update the row and its "Last verified" date. |

Grep before opening a PR that changes a chain's `status` or
`integrationStatus`:

```bash
grep -rnE "[0-9]+ (chains|networks)|(small|registry) fee|fee per chunk|enough to retrieve" apps/web/src docs README.md
```

Any hit that is a literal number, a hand-written network list, or a fee
claim is a bug.
