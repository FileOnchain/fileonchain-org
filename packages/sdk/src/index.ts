/**
 * @fileonchain/sdk — the FileOnChain umbrella. One install that re-exports
 * the whole toolkit:
 *
 *   - the root entry: everything in `@fileonchain/utils` (chain registry,
 *     CID validation, anchor payload vocabulary, orchestration helpers)
 *     plus the EVM contract ABIs;
 *   - one subpath per chain family (`@fileonchain/sdk/evm`, `/substrate`,
 *     `/solana`, `/aptos`, `/cosmos`, `/sui`, `/starknet`, `/near`,
 *     `/tron`, `/cardano`, `/ton`, `/hedera`) re-exporting that family's
 *     `@fileonchain/sdk-<family>` package — heavy peer dependencies (viem,
 *     @polkadot/api, @solana/web3.js) stay opt-in behind their subpaths;
 *   - `@fileonchain/sdk/api`, the typed client for the hosted HTTP API.
 *
 * Depend on the individual packages instead when you want the smallest
 * possible install (e.g. only `@fileonchain/sdk-evm`).
 */

export * from "@fileonchain/utils";
export {
  fileRegistryAbi,
  fileOnChainTokenAbi,
  validatorStakingAbi,
  platformRegistryAbi,
  fileOnChainGovernorAbi,
  cachePaymentsAbi,
  donationEscrowAbi,
} from "@fileonchain/sdk-evm/abis";
