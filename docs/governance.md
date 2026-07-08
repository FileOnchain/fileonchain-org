# Governance

FileOnChain's anchor protocol is governed by the FOCAT token through an
on-chain Governor on EVM; the other contract runtimes mirror those
decisions through admin accounts. This document is the seam between the
two.

## What governance decides

Governance sets **protocol rules**, never per-file outcomes:

- fee split bps (`validatorBps` / `platformBps` / `protocolBps`, sum 10000)
- the max platform fee cap and platform registration / deactivation
- propose and challenge bond sizes, the minimum tip
- challenge and vote window durations
- jury size and per-juror slash amount
- validator minimum stake and unbonding period
- protocol-treasury spends (the timelock holds the treasury)

Whether an individual CID is verified is decided by the optimistic
challenge window and, on dispute, by a staked-validator jury — not by
token votes.

## The EVM hub

`contracts/evm/src/governance/` holds `FileOnChainGovernor` (OZ Governor:
1-day voting delay, 1-week voting period, 100k FOCAT proposal threshold, 4%
quorum, all deploy-time configurable) and `FileOnChainTimelock` (2-day min
delay). The deploy script wires the handoff completely:

- the Governor is the timelock's only proposer/canceller; execution is open
- the timelock owns `FileRegistry`, `ValidatorStaking`, and
  `PlatformRegistry` — every parameter setter is `onlyOwner`
- the timelock **is** the protocol treasury: the 15% protocol share of
  every verified tip accrues to it, and spending it is a proposal
- the deployer renounces its timelock admin role at the end of the run

So on EVM, a parameter change is: delegate FOCAT → propose the setter call →
vote → queue → wait out the timelock → execute.

## The non-EVM seam

Aptos, Sui, Starknet, and NEAR run the same propose/verify protocol
(same 60/25/15 split, same lifecycle, same defaults) but do **not** port
the Governor. Each runtime's registry keeps its parameters behind an
admin:

| Runtime | Admin mechanism | Handoff call |
| --- | --- | --- |
| Aptos | `admin: address` in `fileonchain::anchor_registry` | `set_admin` |
| Sui | `AdminCap` object | transfer the `AdminCap` |
| Starknet | `admin` storage on `AnchorRegistry` | `set_admin` |
| NEAR | `admin` account on the registry contract | `set_admin` |

**The admin account executes EVM governance decisions.** When a proposal
passes on EVM (say, `setFeeSplit(7000, 2000, 1000)`), the admin — a
FileOnChain-operated account today, a multisig or bridge executor as the
protocol matures — replays the equivalent setter on each non-EVM runtime
(`set_fee_split(7000, 2000, 1000)`). Every non-EVM registry exposes the
same setter vocabulary as the EVM contract, so decisions map one-to-one.

This is a trust seam by design (v1): non-EVM parameter changes are only as
trustworthy as the admin's fidelity to EVM governance outcomes. Replacing
the manual replay with a cross-chain message executor is a follow-up.

## Upgradeability

Every EVM protocol contract (token, FileRegistry, ValidatorStaking,
PlatformRegistry, CachePayments, DonationEscrow) lives behind an OZ
**TransparentUpgradeableProxy** whose auto-created ProxyAdmin is owned by
the timelock — an upgrade is a governance proposal that calls
`ProxyAdmin.upgradeAndCall`, exactly like a parameter change. The Governor
and Timelock themselves are deliberately **not** proxied: a governor
migration is a proposer-role rotation on the timelock, and the timelock is
the root of trust.

The other runtimes upgrade natively, executed by the same admin:

| Runtime | Upgrade mechanism |
| --- | --- |
| Aptos | package republish (compatible upgrade policy) |
| Sui | package upgrade via the publisher's `UpgradeCap` |
| Starknet | `upgrade(new_class_hash)` on each contract (`replace_class`) |
| NEAR | redeploy the wasm to the same account (full-access key; state preserved) |

## Bridging

The same FOCAT exists on every runtime; supply moves by **burn on the
source chain, mint on the destination**, through governance-approved
bridges — no bridge vendor is hard-coded. On EVM the token implements
ERC-7802 (`crosschainMint`/`crosschainBurn`) with per-bridge mint/burn
rate limits that replenish linearly over one day (xERC20-style): the limit
is the blast-radius cap if a bridge is compromised. The non-EVM tokens
carry admin-managed bridge allowlists with the same mint/burn pair
(rate limits are EVM-only in v1 — a documented gap).

Initial supply mints on the **home chain only**; remote deployments start
at zero supply and receive FOCAT exclusively through bridges, so the
global supply stays fixed.

## Token notes

FOCAT exists natively on every contract runtime (ERC-20 with ERC20Votes on
EVM, a Fungible Asset on Aptos, `Coin<FOCAT>` on Sui, a minimal ERC-20 in
Cairo on Starknet, NEP-141 on NEAR), connected by the bridge model above
into one global supply. Only the EVM token carries governance voting
power; elsewhere FOCAT is a utility asset — tips, bonds, and validator
stakes on that runtime.

## Known v1 limitations

Documented and accepted; each has a follow-up path:

- jury randomness is chain-dependent: real native randomness on Aptos and
  Sui; `prevrandao` + parent blockhash on EVM (sequencer-influenceable on
  most L2s); a two-step block-hash draw on Starknet (weakest); the block
  producer's `random_seed` on NEAR
- jury votes are public (no commit-reveal) and non-voting jurors are not
  slashed
- platform registration is governance-gated rather than permissionless
- no delegation of validator stake; juries are uniform, not stake-weighted
