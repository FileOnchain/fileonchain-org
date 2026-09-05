import "server-only";
import {
  CHAINS,
  buildChunkAnchorPayload,
  fileRegistryAbi,
  isChainProvisioned,
  type ChainConfig,
} from "@fileonchain/sdk";
import {
  getSeedCostEstimates,
  type ChainCostEstimate,
} from "@/lib/costs";

/**
 * Live anchoring cost quotes — the server half of `lib/costs.ts`.
 *
 * At quote time the seed table is overlaid with real data, per family:
 * - EVM (provisioned): `eth_estimateGas` on the actual `anchorChunk`
 *   calldata × the chain's current gas price.
 * - Substrate (provisioned): `payment_queryInfo` (`paymentInfo`) on a
 *   representative `system.remarkWithEvent` extrinsic.
 * - Solana: the protocol's deterministic fee-per-signature (a memo anchor
 *   is one signature); the volatile part is the SOL price.
 * - Every mainnet: the native fee is converted to USD with a live price
 *   feed (CoinGecko, no key required).
 *
 * Unprovisioned families keep their seed fee (their sends are mocked
 * anyway), and testnet tokens are never priced — their seed nominal USD
 * stands. Every failure falls back to the seed row for that chain, so a
 * dead RPC or a price-feed outage can never blank the upload UI. Results
 * are cached in-memory for `QUOTE_TTL_MS`.
 */

const QUOTE_TTL_MS = 5 * 60 * 1000;
const PRICE_FEED_TIMEOUT_MS = 5_000;
const RPC_TIMEOUT_MS = 5_000;
const SUBSTRATE_TIMEOUT_MS = 8_000;

/** Native-symbol → CoinGecko id for every mainnet token we can price.
 *  Testnet symbols are intentionally absent — free tokens have no price. */
const COINGECKO_IDS: Record<string, string> = {
  ETH: "ethereum",
  AI3: "autonomys-network",
  MATIC: "matic-network",
  BNB: "binancecoin",
  AVAX: "avalanche-2",
  MNT: "mantle",
  CELO: "celo",
  DOT: "polkadot",
  KSM: "kusama",
  SOL: "solana",
  APT: "aptos",
  ATOM: "cosmos",
  SUI: "sui",
  STRK: "starknet",
  NEAR: "near",
  TRX: "tron",
  ADA: "cardano",
  TON: "the-open-network",
  HBAR: "hedera-hashgraph",
};

/** A structurally valid CIDv1 (base32) used to size representative
 *  anchor calldata for gas estimation — never sent. */
const PROBE_CID = "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi";

/** Representative single-chunk anchor payload (~150 bytes of JSON) —
 *  the `uri` a real evidence-only chunk anchor carries. */
const probeAnchorPayload = (): string =>
  buildChunkAnchorPayload({
    fileCid: PROBE_CID,
    chunk: { cid: PROBE_CID, index: 0 },
    total: 1,
  });

/** `from` for eth_estimateGas — anchoring is free, so any address works. */
const PROBE_EVM_ACCOUNT = "0x0000000000000000000000000000000000000001" as const;

/** Gas units for one `anchorChunk` call when `eth_estimateGas` itself
 *  fails but the gas-price read succeeded (event emit + first-write
 *  record, measured on the deployed registries). */
const FALLBACK_ANCHOR_GAS = 90_000n;

const withTimeout = async <T>(promise: Promise<T>, ms: number): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
};

/** Fetch USD prices for every symbol we can map, or null on any failure. */
const fetchUsdPrices = async (): Promise<Map<string, number> | null> => {
  const ids = [...new Set(Object.values(COINGECKO_IDS))];
  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(",")}&vs_currencies=usd`,
      // No Next data-cache opts — the module-level TTL cache below is the
      // caching layer, and a custom AbortSignal opts fetch out anyway.
      { signal: AbortSignal.timeout(PRICE_FEED_TIMEOUT_MS) },
    );
    if (!res.ok) return null;
    const body = (await res.json()) as Record<string, { usd?: number }>;
    const bySymbol = new Map<string, number>();
    for (const [symbol, id] of Object.entries(COINGECKO_IDS)) {
      const usd = body[id]?.usd;
      if (typeof usd === "number" && usd > 0) bySymbol.set(symbol, usd);
    }
    return bySymbol.size > 0 ? bySymbol : null;
  } catch {
    return null;
  }
};

/** Live per-chunk fee in native units for a provisioned EVM registry:
 *  estimateGas on real `anchorChunk` calldata × current gas price. */
const quoteEvmFeeNative = async (chain: ChainConfig): Promise<number | null> => {
  try {
    const [{ createPublicClient, http, encodeFunctionData, zeroHash }, { toViemChain, cidToBytes32 }] =
      await Promise.all([import("viem"), import("@fileonchain/sdk/evm")]);
    const client = createPublicClient({
      chain: toViemChain(chain),
      transport: http(chain.rpcUrl, { timeout: RPC_TIMEOUT_MS, retryCount: 1 }),
    });
    const data = encodeFunctionData({
      abi: fileRegistryAbi,
      functionName: "anchorChunk",
      args: [cidToBytes32(PROBE_CID), zeroHash, probeAnchorPayload()],
    });
    const gasPrice = await client.getGasPrice();
    const gas = await client
      .estimateGas({
        account: PROBE_EVM_ACCOUNT,
        to: chain.registryContract as `0x${string}`,
        data,
      })
      .catch(() => FALLBACK_ANCHOR_GAS);
    return Number(gas * gasPrice) / 10 ** chain.nativeCurrency.decimals;
  } catch {
    return null;
  }
};

/** Well-known dev account (Alice) used only to price extrinsics —
 *  ss58 decodes to a pubkey regardless of the chain's own prefix. */
const SUBSTRATE_PROBE_ADDRESS =
  "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY";

/** Live per-chunk fee for a provisioned substrate chain via
 *  `paymentInfo` on a representative `system.remarkWithEvent`. */
const quoteSubstrateFeeNative = async (
  chain: ChainConfig,
): Promise<number | null> => {
  let api: import("@polkadot/api").ApiPromise | undefined;
  let provider: import("@polkadot/api").WsProvider | undefined;
  try {
    const { ApiPromise, WsProvider } = await import("@polkadot/api");
    provider = new WsProvider(chain.rpcUrl);
    api = await withTimeout(
      ApiPromise.create({ provider, throwOnConnect: true, noInitWarn: true }),
      SUBSTRATE_TIMEOUT_MS,
    );
    const info = await withTimeout(
      // Any well-formed account works — payment_queryInfo prices the
      // call, it does not check the signer.
      api.tx.system
        .remarkWithEvent(probeAnchorPayload())
        .paymentInfo(SUBSTRATE_PROBE_ADDRESS),
      SUBSTRATE_TIMEOUT_MS,
    );
    return (
      Number(info.partialFee.toBigInt()) / 10 ** chain.nativeCurrency.decimals
    );
  } catch {
    return null;
  } finally {
    // Disconnect the api when it came up, else the bare provider (an
    // ApiPromise.create timeout leaves the socket connecting/retrying).
    if (api) void api.disconnect().catch(() => undefined);
    else void provider?.disconnect().catch(() => undefined);
  }
};

/** Solana charges a deterministic fee per signature; a memo anchor is one
 *  signed transaction, so the fee side needs no RPC — the volatile part
 *  is the SOL/USD price. */
const SOLANA_LAMPORTS_PER_SIGNATURE = 5_000;

const quoteFeeNative = async (chain: ChainConfig): Promise<number | null> => {
  if (!isChainProvisioned(chain)) return null;
  switch (chain.family) {
    case "evm":
      return quoteEvmFeeNative(chain);
    case "substrate":
      return quoteSubstrateFeeNative(chain);
    case "solana":
      return SOLANA_LAMPORTS_PER_SIGNATURE / 10 ** chain.nativeCurrency.decimals;
    default:
      // Other families keep their seed fee until their live quote path
      // lands alongside a real provisioned deployment.
      return null;
  }
};

const buildLiveEstimates = async (): Promise<ChainCostEstimate[]> => {
  const seeds = getSeedCostEstimates();
  const chainsById = new Map(CHAINS.map((chain) => [chain.id, chain]));

  const [prices, feeResults] = await Promise.all([
    fetchUsdPrices(),
    Promise.all(
      seeds.map(async (seed) => {
        const chain = chainsById.get(seed.chainId);
        if (!chain) return null;
        return quoteFeeNative(chain);
      }),
    ),
  ]);

  return seeds.map((seed, i) => {
    const chain = chainsById.get(seed.chainId);
    const liveFeeNative = feeResults[i];
    const price =
      chain && !chain.testnet
        ? (prices?.get(chain.nativeCurrency.symbol) ?? null)
        : null;

    const feePerChunkNative = liveFeeNative ?? seed.feePerChunkNative;
    // Testnet tokens are free — their nominal seed USD stands even when
    // the native fee was quoted live.
    const feePerChunkUsd =
      price !== null ? feePerChunkNative * price : seed.feePerChunkUsd;

    if (liveFeeNative === null && price === null) return seed;
    return {
      ...seed,
      feePerChunkNative,
      feePerChunkUsd,
      source: "live" as const,
    };
  });
};

let cache: { at: number; estimates: ChainCostEstimate[] } | null = null;
let inFlight: Promise<ChainCostEstimate[]> | null = null;

/**
 * The cost estimates the server quotes with — live where quotable, seed
 * elsewhere. Never throws; the worst case is the pure seed table.
 */
export const getCostEstimates = async (): Promise<ChainCostEstimate[]> => {
  if (cache && Date.now() - cache.at < QUOTE_TTL_MS) return cache.estimates;
  if (!inFlight) {
    inFlight = buildLiveEstimates()
      .then((estimates) => {
        cache = { at: Date.now(), estimates };
        return estimates;
      })
      .catch(() => cache?.estimates ?? getSeedCostEstimates())
      .finally(() => {
        inFlight = null;
      });
  }
  return inFlight;
};
