# ADR 0001 — Remove FOCAT and the verification market

**Status:** Accepted
**Date:** 2026-07

## Context

The original FileOnChain design (v1 of the whitepaper) centered on a
staked verification market: a FOCAT token (ERC20Votes, bridgeable),
validator staking, paid `proposeAnchor` flows with tips and bonds, a
24-hour challenge window, 5-member dispute juries drawn from the
validator set, slashing, platform fee splits, and EVM-hubbed token
governance (Governor + Timelock) mirrored to non-EVM runtimes. It was
implemented across five contract runtimes and threaded through the
SDK, the webapp, and the hosted backend.

The market answered a question customers were not asking. The v1
customer — developers building AI agents and automated workflows —
needs an independently verifiable record of what a system produced;
they do not need a token, an economic security game, or governance to
get one. The market machinery multiplied the audit surface, coupled
every chain rollout to token deployment and bridging, and made the
product story about cryptoeconomics instead of evidence.

## Decision

Remove the token and the verification market from the product
entirely: no FOCAT, no staking, no tips or bonds, no challenge
periods, no juries, no slashing, no bridges, no token voting, no
governor or timelock, no platform fee splits — in the contracts, the
SDKs, the API, the database, and the UI. Anchoring costs each chain's
ordinary transaction fee; hosted services charge account credits
(USD/USDC).

The market design is preserved, unmaintained, on the repository branch
`archive/focat-verification-market`. It is not part of the current
architecture and nothing depends on it.

## Consequences

- The contracts shrink to anchor-only registries; the audit surface
  and per-chain deployment cost drop accordingly.
- Trust claims become honest by construction: evidence quality comes
  from cryptography and public settlement, not from a staked oracle,
  so nothing needs to be said about economic security.
- Revenue is service revenue (FileOnChain Cloud credits), not token
  value capture.
- If a decentralized attestation/verification market is ever wanted
  again, it must return as a separate, opt-in layer on top of the
  Evidence Protocol — the archived branch is a reference, not a
  restore point.
- Historical documents and code referencing FOCAT survive only on the
  archive branch; current documentation mentions the market only as
  removed history (as this ADR does).
