# Contract release plan: testnet to mainnet, safely

The per-runtime runbooks in this folder (`evm.md`, `aptos.md`, `sui.md`,
`starknet.md`, `near.md`, `hedera.md`) say **how** to deploy. This page
says **in what order, with which keys, and behind which gates**, so a
mainnet deploy is a repeat of a rehearsed testnet deploy and never a
first attempt.

The contracts are anchor-only and hold no user funds at rest, so the risk
is not "a drained vault". The real risks are:

1. **Upgrade power on a single key.** Whoever controls the EVM
   `ProxyAdmin`, the Aptos publisher account, the Sui `UpgradeCap`, or the
   NEAR contract account's full-access key can change what future anchors
   and reads do (for example the first-write `getCIDRecord` storage on
   EVM). Events already emitted cannot be rewritten, but a hostile or
   mistaken upgrade would damage trust in every receipt after it.
2. **Money paths misconfigured.** `CachePayments` moves USDC and
   `DonationEscrow` forwards native value to `treasury`. A wrong USDC
   address (or a `MockUSDC` on mainnet) or a treasury on a lost key is
   costly to unwind.
3. **Recording drift.** `packages/utils/src/chains.ts` flips real
   anchoring on from the recorded address alone (`isChainProvisioned`).
   A wrong or implementation (not proxy) address there sends real user
   transactions to the wrong place.
4. **Overclaiming.** Announcing a network beyond its `integrationStatus`
   (see `docs/integrations/status.md`).

## What each runtime can change after deploy

| Runtime | Artifact | Who can change it later | Pause? |
| --- | --- | --- | --- |
| EVM | `FileRegistry`, `CachePayments`, `DonationEscrow` (transparent proxies) | `ProxyAdmin` owner = `ADMIN_ADDRESS` upgrades all three. `treasury` can pause cache/donations, set cache prices, and hand over treasury (two-step). `FileRegistry.owner` exists but gates nothing. | Cache + donations: yes (`setPaused`, treasury only). Registry: no. |
| Aptos | `file_registry` | Publisher account (compatible upgrade policy) | No |
| Sui | `file_registry` | Holder of the package `UpgradeCap` | No |
| Starknet | `FileRegistry` | Nobody: no `replace_class` entrypoint, the class is immutable | No |
| NEAR | `registry` | Any full-access key on the contract account (redeploy wasm) | No |
| Solana, Cosmos, TRON (memo), Cardano, TON | nothing deployed | n/a: risk is only the server `ANCHOR_*` signer | n/a |
| Hedera | HCS topic (no submit key) | Topic admin key, if one was set | n/a |

The registry has no pause by design (it is an event carrier). The
emergency stop for anchoring is **off-chain**: unset the address or set
`status: "deprecated"` on the chain entry in `chains.ts` and ship the
webapp; the hosted worker and the upload flow stop writing to it.

## Roles and keys

Keep these four roles on different keys on every mainnet. Rehearse the
same split on testnet so the procedure is identical.

| Role | Holds | Mainnet form | Notes |
| --- | --- | --- | --- |
| Deployer | native gas only | Foundry keystore (`--account deployer`) or hardware wallet; fresh per release is fine | Holds **no** power after the run. Never `PRIVATE_KEY` in `.env` on mainnet. |
| Admin | EVM `ProxyAdmin` owner; Aptos publisher / Sui `UpgradeCap` / NEAR full-access key equivalent | Safe multisig (e.g. 2-of-3, hardware signers held by different people) | Upgrades only. |
| Treasury | `CachePayments` / `DonationEscrow` `treasury` | Safe multisig, can be the same Safe as admin or a separate one | Pause, prices, receives funds. |
| Server anchoring signer | `ANCHOR_<FAMILY>_*` env vars in the hosted worker | Hot key with a small gas float, topped up on alert | Has no contract power; anchoring is permissionless. Rotate freely. |

`script/Deploy.s.sol` enforces the EVM part of this table on known
mainnet chain ids (`isKnownMainnet`): it reverts before broadcasting if
`USDC_ADDRESS` is unset or has no code, or if `ADMIN_ADDRESS` /
`TREASURY_ADDRESS` is the deployer or is not a contract. Testnets keep
the convenient defaults (deployer as admin, `MockUSDC`). If a target
mainnet has no Safe deployment yet, deploy the Safe contracts there first
(Safe's singleton factory); do not weaken the guard.

## The pipeline

Every release moves through the same five gates. A gate is passed only
when its checklist is complete and recorded in the PR or in the
"Current deployments" section of the runbook.

### Gate 0: freeze a release candidate

- One commit, one tag (`contracts-vX.Y.Z`). Testnet and mainnet deploy
  **from the same tag**; any contract change restarts at Gate 0.
- All suites green from a clean checkout:
  `forge test`, `forge coverage` (target ≥95%),
  `aptos move test --dev`, `sui move test`, `scarb build && scarb test`,
  `cargo test -p fileonchain-registry`.
- ABIs regenerated (`packages/sdk-evm/scripts/extract-abis.mjs`) and
  `pnpm build` green, so the SDK talks to exactly the bytecode being
  deployed.
- For an **upgrade** of an existing EVM proxy: diff the storage layout
  (`forge inspect <Contract> storageLayout` on the old tag vs the new one).
  Only appends are allowed; reordering or retyping a slot is a stop.
- Static analysis run (e.g. Slither on `contracts/evm`) with every finding
  either fixed or written down as accepted.
- Before the first mainnet with real money paths (`CachePayments`), an
  external review or audit of the EVM suite. `integrationStatus:
  "audited"` is only set after that report exists.

### Gate 1: dress rehearsal on a fork

Run the exact mainnet command against a local fork of the target mainnet,
with the **real** mainnet Safe addresses and USDC:

```bash
anvil --fork-url <MAINNET_RPC> --port 8545 &
cd contracts/evm
ADMIN_ADDRESS=<safe> TREASURY_ADDRESS=<safe> USDC_ADDRESS=<usdc> \
  forge script script/Deploy.s.sol --rpc-url http://127.0.0.1:8545 \
  --account deployer --broadcast
```

Then run the post-deploy checks below against the fork. This proves the
config passes the guard, the gas budget is enough (add
`--gas-estimate-multiplier 200` if needed, see `evm.md`), and the
checklist works, without spending anything.

### Gate 2: testnet deploy and soak

- Deploy with the same procedure as mainnet: keystore deployer, Safe (or
  at least a non-deployer) admin and treasury on the testnet. Only the
  USDC differs (`MockUSDC`).
- Verify sources on the explorer (`--verify`, or
  `script/verify-broadcast.mjs` for Blockscout chains).
- Run the post-deploy checks.
- Record the proxies in `chains.ts` and in the runbook's "Current
  deployments", set `integrationStatus: "testnet-deployed"`, open the PR.
- Exercise every admin path **through the Safe**: a no-op upgrade
  (`ProxyAdmin.upgradeAndCall` to a freshly deployed identical
  implementation), `setPaused(true/false)`, `setPrices`, and a full
  two-step `setTreasury` / `acceptTreasury` round trip. A procedure that
  has never been run on testnet is not run first on mainnet.
- QA end to end: PAYG wallet upload and credits/BYOK hosted-worker upload,
  explorer links, the indexer (`/api/cron/indexer-scan`), the `/verify`
  page on a fresh envelope. Then `integrationStatus: "webapp-integrated"`.
- Soak for at least a week of normal use with no unexplained failures.

### Gate 3: mainnet go / no-go

Sign off on each line in the release PR:

- [ ] Gates 0 to 2 done for **this** tag.
- [ ] Mainnet Safes exist, signers confirmed, each signer has signed a
      test transaction.
- [ ] Mainnet USDC address checked against the issuer's published list
      (not copied from a block explorer search).
- [ ] Deployer funded with enough gas for the run plus margin;
      server signer funded with a starting float.
- [ ] Monitoring ready (see below).
- [ ] Rollback plan written: who flips `chains.ts`, who can sign the Safe.

### Gate 4: mainnet deploy

1. Simulate first: same `forge script` command **without** `--broadcast`.
   Read the planned transactions and the logged addresses.
2. Broadcast with `--verify` (or verify afterwards).
3. Post-deploy checks (below). Any mismatch: stop, do not record.
4. Canary: one anchor from a team wallet through the SDK, then confirm the
   event on the explorer and `isCIDAnchored` / `getCIDRecord`.
5. Record proxies in `chains.ts` and the runbook, set
   `integrationStatus: "mainnet-deployed"`, open the PR. Merge and ship
   the webapp only after review of the addresses by a second person.
6. After live QA on mainnet, `"webapp-integrated"`. Never higher than what
   was actually observed.

### Gate 5: operate

- **Monitoring:** server signer balance per chain (alert below a float),
  hosted job failure rate per chain, `Upgraded`, `AdminChanged`,
  `OwnershipTransferred`, `TreasuryTransferStarted`, `TreasuryUpdated`,
  `PausedSet`, `PricesUpdated` events on every proxy (any unexpected one is an incident).
- **Incident playbook:** stop writes via `chains.ts` (see top); pause cache
  and donations from the treasury Safe; fix via a Safe-signed upgrade that
  goes through Gates 0 to 2 again, compressed but not skipped.

## Post-deploy checks (EVM)

Run against each proxy. `cast` reads the ERC-1967 slots directly, so these
do not trust the deploy log.

```bash
IMPL_SLOT=0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc
ADMIN_SLOT=0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103

cast storage <proxy> $IMPL_SLOT --rpc-url $RPC   # == logged implementation
cast storage <proxy> $ADMIN_SLOT --rpc-url $RPC  # the proxy's ProxyAdmin (last 20 bytes)
cast call <ProxyAdmin> "owner()(address)" --rpc-url $RPC  # == admin Safe

cast call <cacheProxy>    "treasury()(address)" --rpc-url $RPC  # == treasury Safe
cast call <cacheProxy>    "usdc()(address)"     --rpc-url $RPC  # == real USDC
cast call <donationProxy> "treasury()(address)" --rpc-url $RPC  # == treasury Safe
```

Also confirm that calling `initialize` again on each proxy reverts, and
that the explorer shows verified source for every implementation.

## Upgrades

EVM: deploy the new implementation (from a Gate 0 tag), then the admin
Safe calls `ProxyAdmin.upgradeAndCall(proxy, newImpl, "")`. The proxy
address in `chains.ts` never changes; record the new implementation in the
runbook. Run on testnet first, every time.

Once `FileRegistry` has been stable on a mainnet for a while, consider
making it immutable by renouncing its `ProxyAdmin` ownership: anchors
then rest on bytecode nobody can change, which is a stronger evidence
story. This is a one-way decision; take it explicitly, per chain.

Non-EVM mainnets, decided at publish time:

- **Aptos:** publish from an account controlled by a multisig, or publish
  with the `immutable` upgrade policy.
- **Sui:** right after publishing, transfer the `UpgradeCap` to a
  multisig address, or make the package immutable
  (`0x2::package::make_immutable`).
- **NEAR:** after the deploy, keep the contract account's full-access key
  only on a hardware wallet / multisig, or delete it to lock the code.
- **Starknet:** already immutable; a fix means a new deployment and a new
  address in `chains.ts`.
- **Hedera:** create the topic with no submit key (as in `hedera.md`) and
  no admin key on mainnet unless there is a reason to keep one.

## Order of rollout

Follow the tiers in `evm.md` and the "testnet first, QA, then mainnet"
step in each runbook. One mainnet at a time; each one goes through Gates
3 and 4 on its own. The next EVM mainnet in line is Auto EVM (`evm:870`),
whose Chronos (`evm:8700`) deployment is the testnet half of its Gate 2.
Note that the current Ethereum Sepolia deployment's admin
(`0xa8F8…868A`) is an EOA, and Chronos was deployed with the same
default-admin script, so neither rehearses the Safe flows yet: transfer
each `ProxyAdmin` (and the treasury, two-step) to a testnet Safe, or
redeploy, before using them as the Gate 2 evidence for a mainnet.
