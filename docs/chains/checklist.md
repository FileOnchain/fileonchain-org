# Chain checklist

The definition of done for adding a new chain **or** productionizing an
existing entry (mock → real). Work through it top to bottom; a chain ships
when every box is checked.

- [ ] **Registry entry** — the chain has an entry in
  `packages/utils/src/chains.ts` with every field correct: `id`
  (`family:reference`), `family`, names, `rpcUrl`, explorer URL + tx/address
  paths, `nativeCurrency`, `icon`, `testnet`, and any family extras
  (`bech32Prefix`, `embedsChunkData`). Both mainnet **and** testnet entries
  exist. No chain data hardcoded anywhere else.
- [ ] **Icon** — the SVG referenced by the entry's `icon` field exists in
  `apps/web/public/chains/`.
- [ ] **Cost row** — the chain has a per-anchor cost row in
  `apps/web/src/lib/mock/costs.ts` so the upload estimator prices it.
- [ ] **Provisioned** — `isChainProvisioned` (see
  `packages/utils/src/anchor.ts`) returns true via the **right field for the
  family**: `registryContract` (EVM, Starknet), `moduleAddress` (Aptos, Sui,
  NEAR), `palletContract` (Substrate), `memoAnchoring` (Cosmos, TRON,
  Cardano, TON), `hcsTopicId` (Hedera). Solana is always provisioned. Set it
  per the runbook in `docs/deploy/`.
- [ ] **Propose path provisioned** (contract families only) — the anchor
  protocol fields are recorded on the entry so `isProposeProvisioned` flips
  on: `tokenContract` (all five), plus `stakingContract` /
  `platformRegistryContract` / `governorContract` / `timelockContract` on
  EVM, the AnchorRegistry shared-object id in `registryContract` on Sui,
  and the AnchorRegistry contract in `stakingContract` on Starknet. The
  server signer holds FOCAT (tips + bonds), and at least `jurySize` (5)
  validators are staked so challenges can draw a jury.
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
- [ ] **`pnpm build` is green** — run from the repo root after all edits;
  it typechecks and lints the SDK and webapp.
