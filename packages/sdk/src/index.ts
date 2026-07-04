/**
 * @fileonchain/sdk — anchor file and folder CIDs on-chain without the
 * FileOnChain frontend.
 *
 * The core entry point is dependency-free: supported networks, contract
 * addresses, ABIs, CID validation, and the chain-agnostic anchor payload
 * format every family writes on-chain. Chain clients live behind subpaths
 * so their heavy dependencies stay opt-in:
 *   - "@fileonchain/sdk/evm"       (peer: viem)
 *   - "@fileonchain/sdk/substrate" (peer: @polkadot/api)
 *   - "@fileonchain/sdk/solana"    (peer: @solana/web3.js)
 *   - "@fileonchain/sdk/aptos", "/cosmos", "/sui", "/starknet", "/near",
 *     "/tron", "/cardano", "/ton", "/hedera" (dependency-free — the SDK
 *     orchestrates, a minimal structural signer owns transport)
 */

export type { ChainFamily, ChainId, CIDRegistryRecord } from "./types";
export {
  CHAINS,
  DEFAULT_CHAIN_ID,
  ZERO_ADDRESS,
  CHAIN_FAMILIES,
  CHAIN_FAMILY_LABELS,
  CHAIN_FAMILY_TAGLINES,
  MAINNET_CHAINS,
  TESTNET_CHAINS,
  getChain,
  getChainsByFamily,
  getVisibleChains,
  getRegistryAddress,
  buildTxUrl,
  buildAddressUrl,
  type ChainConfig,
} from "./chains";
export { CIDV1_BASE32_RE, isValidCID, validateOrError } from "./cid";
export {
  ANCHOR_PROTOCOL,
  ANCHOR_PAYLOAD_VERSION,
  buildFileAnchorPayload,
  buildChunkAnchorPayload,
  parseAnchorPayload,
  bytesToBase64,
  base64ToBytes,
  ChainNotProvisionedError,
  isChainProvisioned,
  type AnchorPayload,
  type FileAnchorPayload,
  type ChunkAnchorPayload,
  type AnchorChunk,
  type AnchorStage,
  type AnchorProgress,
  type AnchorProgressHandler,
  type ChunkedAnchorReceipt,
} from "./anchor";
export { fileRegistryAbi, cachePaymentsAbi, donationEscrowAbi } from "./abis/index";
