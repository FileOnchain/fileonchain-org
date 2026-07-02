import type { ChainId, ChainFamily } from "./types";

/**
 * ChainConfig — the single source of truth for every supported network.
 *
 * Each chain carries its RPC endpoint, explorer paths, and the relevant
 * on-chain addresses (or Solana program / Aptos module / Substrate remark
 * extrinsic) used to anchor CIDs. Contract addresses live here and only
 * here — do not duplicate them in per-contract maps.
 */
export interface ChainConfig {
  id: ChainId;
  family: ChainFamily;
  name: string;
  shortName: string;
  rpcUrl: string;
  explorerUrl: string;
  explorerTxPath: string;
  explorerAddressPath: string;
  nativeCurrency: { symbol: string; decimals: number };
  /** Asset key for chain logos; the reference frontend maps it to /chains/*.svg. */
  icon: string;
  registryContract: `0x${string}` | null;
  cacheContract: `0x${string}` | null;
  donationContract: `0x${string}` | null;
  programId: string | null;
  moduleAddress: string | null;
  palletContract: string | null;
  testnet: boolean;
}

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;

/* TODO: deploy address — replace after Foundry Deploy.s.sol runs on each chain */
export const CHAINS: readonly ChainConfig[] = [
  // EVM mainnets
  {
    id: "evm:1",
    family: "evm",
    name: "Ethereum",
    shortName: "ETH",
    rpcUrl: "https://eth.llamarpc.com",
    explorerUrl: "https://etherscan.io",
    explorerTxPath: "/tx/",
    explorerAddressPath: "/address/",
    nativeCurrency: { symbol: "ETH", decimals: 18 },
    icon: "/chains/eth.svg",
    registryContract: ZERO_ADDRESS,
    cacheContract: ZERO_ADDRESS,
    donationContract: ZERO_ADDRESS,
    programId: null,
    moduleAddress: null,
    palletContract: null,
    testnet: false,
  },
  {
    id: "evm:8453",
    family: "evm",
    name: "Base",
    shortName: "BASE",
    rpcUrl: "https://mainnet.base.org",
    explorerUrl: "https://basescan.org",
    explorerTxPath: "/tx/",
    explorerAddressPath: "/address/",
    nativeCurrency: { symbol: "ETH", decimals: 18 },
    icon: "/chains/base.svg",
    registryContract: ZERO_ADDRESS,
    cacheContract: ZERO_ADDRESS,
    donationContract: ZERO_ADDRESS,
    programId: null,
    moduleAddress: null,
    palletContract: null,
    testnet: false,
  },
  {
    id: "evm:10",
    family: "evm",
    name: "Optimism",
    shortName: "OP",
    rpcUrl: "https://mainnet.optimism.io",
    explorerUrl: "https://optimistic.etherscan.io",
    explorerTxPath: "/tx/",
    explorerAddressPath: "/address/",
    nativeCurrency: { symbol: "ETH", decimals: 18 },
    icon: "/chains/op.svg",
    registryContract: ZERO_ADDRESS,
    cacheContract: ZERO_ADDRESS,
    donationContract: ZERO_ADDRESS,
    programId: null,
    moduleAddress: null,
    palletContract: null,
    testnet: false,
  },
  {
    id: "evm:42161",
    family: "evm",
    name: "Arbitrum One",
    shortName: "ARB",
    rpcUrl: "https://arb1.arbitrum.io/rpc",
    explorerUrl: "https://arbiscan.io",
    explorerTxPath: "/tx/",
    explorerAddressPath: "/address/",
    nativeCurrency: { symbol: "ETH", decimals: 18 },
    icon: "/chains/arb.svg",
    registryContract: ZERO_ADDRESS,
    cacheContract: ZERO_ADDRESS,
    donationContract: ZERO_ADDRESS,
    programId: null,
    moduleAddress: null,
    palletContract: null,
    testnet: false,
  },
  {
    id: "evm:137",
    family: "evm",
    name: "Polygon",
    shortName: "POLY",
    rpcUrl: "https://polygon-rpc.com",
    explorerUrl: "https://polygonscan.com",
    explorerTxPath: "/tx/",
    explorerAddressPath: "/address/",
    nativeCurrency: { symbol: "MATIC", decimals: 18 },
    icon: "/chains/polygon.svg",
    registryContract: ZERO_ADDRESS,
    cacheContract: ZERO_ADDRESS,
    donationContract: ZERO_ADDRESS,
    programId: null,
    moduleAddress: null,
    palletContract: null,
    testnet: false,
  },
  // Substrate
  {
    id: "substrate:autonomys-mainnet",
    family: "substrate",
    name: "Autonomys Mainnet",
    shortName: "AUTO",
    rpcUrl: "wss://rpc.mainnet.autonomys.xyz/ws",
    explorerUrl: "https://explorer.autonomys.xyz",
    explorerTxPath: "/extrinsic/",
    explorerAddressPath: "/account/",
    nativeCurrency: { symbol: "AI3", decimals: 18 },
    icon: "/chains/autonomys.svg",
    registryContract: null,
    cacheContract: null,
    donationContract: null,
    programId: null,
    moduleAddress: null,
    palletContract: "system.remarkWithEvent",
    testnet: false,
  },
  {
    id: "substrate:autonomys-taurus",
    family: "substrate",
    name: "Autonomys Taurus",
    shortName: "TAU",
    rpcUrl: "wss://rpc.taurus.autonomys.xyz/ws",
    explorerUrl: "https://explorer.taurus.autonomys.xyz",
    explorerTxPath: "/extrinsic/",
    explorerAddressPath: "/account/",
    nativeCurrency: { symbol: "TAU", decimals: 18 },
    icon: "/chains/autonomys.svg",
    registryContract: null,
    cacheContract: null,
    donationContract: null,
    programId: null,
    moduleAddress: null,
    palletContract: "system.remarkWithEvent",
    testnet: true,
  },
  {
    id: "substrate:polkadot-asset-hub",
    family: "substrate",
    name: "Polkadot Asset Hub",
    shortName: "DOT",
    rpcUrl: "wss://rpc-asset-hub.polkadot.io",
    explorerUrl: "https://assethub-polkadot.subscan.io",
    explorerTxPath: "/extrinsic/",
    explorerAddressPath: "/account/",
    nativeCurrency: { symbol: "DOT", decimals: 10 },
    icon: "/chains/polkadot.svg",
    registryContract: null,
    cacheContract: null,
    donationContract: null,
    programId: null,
    moduleAddress: null,
    palletContract: "system.remarkWithEvent",
    testnet: false,
  },
  // Solana
  {
    id: "solana:mainnet",
    family: "solana",
    name: "Solana",
    shortName: "SOL",
    rpcUrl: "https://api.mainnet-beta.solana.com",
    explorerUrl: "https://solscan.io",
    explorerTxPath: "/tx/",
    explorerAddressPath: "/account/",
    nativeCurrency: { symbol: "SOL", decimals: 9 },
    icon: "/chains/solana.svg",
    registryContract: null,
    cacheContract: null,
    donationContract: null,
    /* TODO: deploy Solana program for CID anchoring */
    programId: null,
    moduleAddress: null,
    palletContract: null,
    testnet: false,
  },
  {
    id: "solana:devnet",
    family: "solana",
    name: "Solana Devnet",
    shortName: "SOL",
    rpcUrl: "https://api.devnet.solana.com",
    explorerUrl: "https://solscan.io",
    explorerTxPath: "/tx/",
    explorerAddressPath: "/account/",
    nativeCurrency: { symbol: "SOL", decimals: 9 },
    icon: "/chains/solana.svg",
    registryContract: null,
    cacheContract: null,
    donationContract: null,
    programId: null,
    moduleAddress: null,
    palletContract: null,
    testnet: true,
  },
  // Aptos
  {
    id: "aptos:mainnet",
    family: "aptos",
    name: "Aptos",
    shortName: "APT",
    rpcUrl: "https://fullnode.mainnet.aptoslabs.com/v1",
    explorerUrl: "https://explorer.aptoslabs.com",
    explorerTxPath: "/txn/",
    explorerAddressPath: "/account/",
    nativeCurrency: { symbol: "APT", decimals: 8 },
    icon: "/chains/aptos.svg",
    registryContract: null,
    cacheContract: null,
    donationContract: null,
    programId: null,
    /* TODO: deploy Move module on Aptos for CID anchoring */
    moduleAddress: null,
    palletContract: null,
    testnet: false,
  },
  {
    id: "aptos:testnet",
    family: "aptos",
    name: "Aptos Testnet",
    shortName: "APT",
    rpcUrl: "https://fullnode.testnet.aptoslabs.com/v1",
    explorerUrl: "https://explorer.aptoslabs.com",
    explorerTxPath: "/txn/",
    explorerAddressPath: "/account/",
    nativeCurrency: { symbol: "APT", decimals: 8 },
    icon: "/chains/aptos.svg",
    registryContract: null,
    cacheContract: null,
    donationContract: null,
    programId: null,
    moduleAddress: null,
    palletContract: null,
    testnet: true,
  },
] as const;

export const DEFAULT_CHAIN_ID: ChainId = "substrate:autonomys-mainnet";

export const getChain = (id: ChainId | string): ChainConfig | undefined =>
  CHAINS.find((c) => c.id === id);

export const getChainsByFamily = (family: ChainFamily): ChainConfig[] =>
  CHAINS.filter((c) => c.family === family);

/**
 * Pick the registry address for a chain, falling back to the zero address.
 */
export const getRegistryAddress = (chainId: ChainId): `0x${string}` =>
  getChain(chainId)?.registryContract ?? ZERO_ADDRESS;

/**
 * Display labels for each chain runtime — used by every surface that
 * groups chains (chain switcher, explorer filters, chains grid). The
 * intent is to surface the architecture plainly so a user can tell a
 * "Base" address apart from a "Solana" address without learning the
 * internal "family" word.
 */
export const CHAIN_FAMILY_LABELS: Record<ChainFamily, string> = {
  evm: "EVM-compatible",
  substrate: "Substrate-based",
  solana: "Solana",
  aptos: "Aptos",
};

/**
 * Short tagline that explains the difference between EVM-compatible and
 * Solana / Aptos in one line. Surfaced in the explorer filter tooltip
 * and the onboarding flow.
 */
export const CHAIN_FAMILY_TAGLINES: Record<ChainFamily, string> = {
  evm: "Same Ethereum tooling, different network.",
  substrate: "Uses Substrate's `system.remark` as the on-chain storage primitive.",
  solana: "Programs instead of contracts. Use a Solana wallet.",
  aptos: "Move modules. Use an Aptos wallet.",
};

/**
 * Build an explorer link for a tx hash.
 */
export const buildTxUrl = (chain: ChainConfig, txHash: string): string =>
  `${chain.explorerUrl}${chain.explorerTxPath}${txHash}`;

/**
 * Build an explorer link for an address or contract.
 */
export const buildAddressUrl = (chain: ChainConfig, address: string): string =>
  `${chain.explorerUrl}${chain.explorerAddressPath}${address}`;
