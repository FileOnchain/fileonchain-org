/**
 * @fileonchain/sdk — anchor file and folder CIDs on-chain without the
 * FileOnChain frontend.
 *
 * The core entry point is dependency-free: supported networks, contract
 * addresses, ABIs, and CID validation. Chain clients live behind subpaths
 * so their heavy dependencies stay opt-in:
 *   - "@fileonchain/sdk/evm"       (peer: viem)
 *   - "@fileonchain/sdk/substrate" (peer: @polkadot/api)
 */

export type { ChainFamily, ChainId, CIDRegistryRecord } from "./types";
export {
  CHAINS,
  DEFAULT_CHAIN_ID,
  ZERO_ADDRESS,
  CHAIN_FAMILY_LABELS,
  CHAIN_FAMILY_TAGLINES,
  getChain,
  getChainsByFamily,
  getRegistryAddress,
  buildTxUrl,
  buildAddressUrl,
  type ChainConfig,
} from "./chains";
export { CIDV1_BASE32_RE, isValidCID, validateOrError } from "./cid";
export { fileRegistryAbi, cachePaymentsAbi, donationEscrowAbi } from "./abis/index";
