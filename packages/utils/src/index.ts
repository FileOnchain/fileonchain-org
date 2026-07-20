/**
 * @fileonchain/utils — the dependency-free FileOnChain core shared by every
 * chain client: supported networks, contract addresses, CID validation, the
 * chain-agnostic anchor payload format every family writes on-chain, and the
 * orchestration helpers the family packages build on.
 *
 * Chain clients live in their own packages so heavy dependencies stay
 * opt-in: `@fileonchain/sdk-evm` (peer viem), `@fileonchain/sdk-substrate`
 * (peer @polkadot/api), `@fileonchain/sdk-solana` (peer @solana/web3.js),
 * and the nine dependency-free ones (`-aptos`, `-cosmos`, `-sui`,
 * `-starknet`, `-near`, `-tron`, `-cardano`, `-ton`, `-hedera`). The
 * `@fileonchain/sdk` umbrella re-exports all of them.
 */

export type { ChainFamily, ChainId, CIDRegistryRecord } from "./types";
export {
  CHAINS,
  DEFAULT_CHAIN_ID,
  ZERO_ADDRESS,
  CHAIN_FAMILIES,
  CHAIN_FAMILY_LABELS,
  CHAIN_FAMILY_TAGLINES,
  CHAIN_STATUS_LABELS,
  INTEGRATION_STATUS_LABELS,
  MAINNET_CHAINS,
  TESTNET_CHAINS,
  ACTIVE_CHAINS,
  ACTIVE_FAMILIES,
  getChain,
  getChainsByFamily,
  getVisibleChains,
  getRegistryAddress,
  getIntegrationStatus,
  isChainActive,
  buildTxUrl,
  buildAddressUrl,
  type ChainConfig,
  type ChainStatus,
  type IntegrationStatus,
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
  type BuildFileAnchorParams,
  type BuildChunkAnchorParams,
} from "./anchor";
export { sha256, sha256Hex, sha256HexUtf8, bytesToHex, hexToBytes } from "./sha256";
export {
  EVIDENCE_PROTOCOL,
  EVIDENCE_PACKAGE_VERSION,
  EVIDENCE_MEDIA_TYPE,
  canonicalStringify,
  buildEvidencePackage,
  signingPayload,
  signingPayloadHash,
  validateEvidencePackage,
  parseEvidencePackage,
  type StorageMode,
  type ArtifactDescriptor,
  type SignerKind,
  type SignatureScheme,
  type SignerIdentity,
  type EvidenceSignature,
  type StorageReceipt,
  type SettlementReceipt,
  type MerkleInclusion,
  type EvidencePackage,
  type BuildEvidencePackageParams,
} from "./evidence";
export {
  MANIFEST_PROTOCOL,
  MANIFEST_VERSION,
  buildMerkleTree,
  verifyMerkleInclusion,
  buildManifest,
  parseManifestAnchorPayload,
  type ManifestEntry,
  type ManifestDocument,
  type ManifestAnchorPayload,
  type MerkleTree,
  type BuildManifestParams,
  type BuiltManifest,
} from "./manifest";
export {
  FAMILY_PAYLOAD_BUDGET_BYTES,
  CHUNK_ENVELOPE_BYTES,
  MIN_CHUNK_DATA_BYTES,
  MAX_CHUNK_DATA_BYTES,
  STORAGE_URI_SCHEME,
  getChunkDataBudget,
  isStorageCapable,
  storageChunkCount,
  buildStorageUri,
  parseStorageUri,
  type StorageUriParts,
} from "./storage";
export {
  resolveFamilyChain,
  utf8ByteLength,
  assertPayloadFits,
  buildChunkedAnchorPayloads,
  batchByBytes,
  batchByCount,
  runSequentialChunkedAnchor,
  type ResolveFamilyChainOptions,
  type BuildChunkedAnchorPayloadsParams,
  type SequentialSendResult,
  type RunSequentialChunkedAnchorParams,
} from "./helpers";
