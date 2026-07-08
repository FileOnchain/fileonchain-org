import {
  DEFAULT_CHAIN_ID,
  getChain,
  isChainProvisioned,
  type ChainConfig,
  type ChainId,
} from "@fileonchain/sdk";
import {
  getChainCostEstimates,
  totalCostFor,
  type ChainCostEstimate,
} from "@/lib/mock/costs";
import { getByokProvider } from "@/lib/byok/providers";
import { buildHeadline, buildRationale } from "@/lib/recommendations/templates";
import type {
  RecommendationBlocker,
  RecommendationFactor,
  RecommendationInput,
  UploadRecommendation,
} from "@/lib/recommendations/types";
import type { UploadPaymentMethod } from "@/hooks/useFileUploader";

/**
 * Deterministic Upload Advisor rule engine. Pure function of its input —
 * the same code runs on the server route and as the client fallback when
 * the API is unreachable, so the two must never diverge. All chain facts
 * come from the SDK registry and the shared cost model; nothing here may
 * invent chain data.
 */

/** Files at or under this size bias toward a testnet on the default intent. */
const TESTNET_SIZE_BIAS_BYTES = 256 * 1024;

/** Above this size the advisor floats redundancy candidates. */
const REDUNDANCY_SIZE_BYTES = 10 * 1024 * 1024;

/** Document-ish MIME types that also suggest redundancy is worth it. */
const REDUNDANCY_MIME_TYPES = new Set([
  "application/pdf",
  "application/zip",
  "application/gzip",
  "application/x-tar",
  "application/x-7z-compressed",
  "text/csv",
]);

/** Credits threshold: at/above this many chunks, skipping signatures wins. */
const CREDITS_CHUNK_THRESHOLD = 10;

interface Candidate {
  chain: ChainConfig;
  estimate: ChainCostEstimate;
  costUsd: number;
  provisioned: boolean;
  score: number;
}

/** Same rounding as the server's computeAnchorCostMicroUsdc, single chain. */
export const requiredMicroUsdc = (costUsd: number): bigint =>
  BigInt(Math.ceil(costUsd * 1_000_000));

const TIER_POINTS: Record<ChainCostEstimate["tier"], number> = {
  testnet: 10,
  cheap: 10,
  moderate: 4,
  expensive: -15,
};

/** null = cost only (lowest_cost intent), no mainnet/testnet preference. */
const resolveWantsTestnet = (input: RecommendationInput): boolean | null => {
  switch (input.intent) {
    case "testnet":
      return true;
    case "production":
      return false;
    case "lowest_cost":
      return null;
    case "balanced":
      return (
        input.file.sizeBytes <= TESTNET_SIZE_BIAS_BYTES ||
        input.file.mimeType.startsWith("text/") ||
        input.file.mimeType === "application/json"
      );
  }
};

const buildCandidates = (input: RecommendationInput): Candidate[] => {
  const chunkCount = Math.max(1, input.file.chunkCount);
  const wantsTestnet = resolveWantsTestnet(input);

  let candidates: Candidate[] = getChainCostEstimates().flatMap((estimate) => {
    const chain = getChain(estimate.chainId);
    // Planned/deprecated chains can't be selected for upload, so the
    // advisor must never suggest one.
    if (!chain || chain.status !== "active") return [];
    return [
      {
        chain,
        estimate,
        costUsd: totalCostFor(estimate, chunkCount).usd,
        provisioned: isChainProvisioned(chain),
        score: 0,
      },
    ];
  });

  // Production intent means permanence — never suggest a testnet.
  if (input.intent === "production") {
    candidates = candidates.filter((c) => !c.chain.testnet);
  }

  // A connected wallet restricts to its family, unless the family has no
  // provisioned chain at all (then any chain beats a guaranteed mock).
  if (input.wallet.connected && input.wallet.family) {
    const familyChains = candidates.filter(
      (c) => c.chain.family === input.wallet.family,
    );
    if (familyChains.some((c) => c.provisioned)) candidates = familyChains;
  }

  // Rank-based cost points so relative ordering matters, not magnitudes.
  const byCost = [...candidates].sort((a, b) => a.costUsd - b.costUsd);
  const costRank = new Map(byCost.map((c, i) => [c.chain.id, i]));
  const denom = Math.max(1, candidates.length - 1);

  for (const c of candidates) {
    let score = 30 * (1 - (costRank.get(c.chain.id) ?? 0) / denom);
    if (wantsTestnet !== null && c.chain.testnet === wantsTestnet) score += 25;
    if (input.wallet.connected && input.wallet.family === c.chain.family)
      score += 40;
    if (c.provisioned) score += 30;
    score += TIER_POINTS[c.estimate.tier];
    if (c.chain.id === DEFAULT_CHAIN_ID) score += 2;
    if (c.chain.id === input.activeChainId) score += 1;
    c.score = score;
  }

  // Deterministic ordering: score desc, then chain id for stable ties.
  return candidates.sort(
    (a, b) => b.score - a.score || a.chain.id.localeCompare(b.chain.id),
  );
};

const pickSecondaryChains = (
  input: RecommendationInput,
  primary: Candidate,
  ranked: Candidate[],
): ChainId[] => {
  const worthIt =
    input.file.sizeBytes > REDUNDANCY_SIZE_BYTES ||
    REDUNDANCY_MIME_TYPES.has(input.file.mimeType);
  if (!worthIt) return [];

  const secondary: ChainId[] = [];
  let extraUsd = 0;
  const cheap = ranked
    .filter(
      (c) =>
        c.chain.id !== primary.chain.id &&
        c.chain.testnet === primary.chain.testnet &&
        (c.estimate.tier === "cheap" || c.estimate.tier === "testnet"),
    )
    .sort((a, b) => a.costUsd - b.costUsd);
  for (const c of cheap) {
    // Combined cost stays under 2× the primary — redundancy, not runaway.
    if (extraUsd + c.costUsd > primary.costUsd) break;
    secondary.push(c.chain.id);
    extraUsd += c.costUsd;
    if (secondary.length === 2) break;
  }
  return secondary;
};

export const computeUploadRecommendation = (
  input: RecommendationInput,
): UploadRecommendation => {
  const chunkCount = Math.max(1, input.file.chunkCount);
  const ranked = buildCandidates(input);
  const primary = ranked[0];
  if (!primary) {
    // Cannot happen while the registry is non-empty, but keep a total function.
    throw new Error("No eligible chains to recommend");
  }

  const { session, wallet } = input;
  const walletMatches =
    wallet.connected && wallet.family === primary.chain.family;
  const required = requiredMicroUsdc(primary.costUsd);
  const balance =
    session.creditBalanceMicroUsdc !== null
      ? BigInt(session.creditBalanceMicroUsdc)
      : null;
  const sufficient = balance !== null && balance >= required;
  const byokKey = session.byokKeys.find((key) =>
    getByokProvider(key.provider)?.chainIds.includes(primary.chain.id),
  );

  // Payment matrix (PRD FR-4): BYOK beats credits when a key covers the
  // chain; credits beat PAYG once signature count hurts or no wallet is
  // connected; PAYG is the only option for guests.
  let paymentMethod: UploadPaymentMethod = "payg";
  const blockers: RecommendationBlocker[] = [];
  if (session.authenticated) {
    if (byokKey) {
      paymentMethod = "byok";
    } else if (sufficient && chunkCount >= CREDITS_CHUNK_THRESHOLD) {
      paymentMethod = "credits";
    } else if (sufficient && !walletMatches) {
      paymentMethod = "credits";
    } else if (sufficient) {
      // Few chunks and a matching wallet — one signature is cheap enough.
      paymentMethod = "payg";
    } else if (balance !== null && walletMatches) {
      paymentMethod = "payg";
    } else if (balance !== null) {
      paymentMethod = "credits";
      blockers.push({
        code: "insufficient_credits",
        message: "Credit balance doesn't cover this upload — top up to anchor server-side.",
        href: "/dashboard/credits",
      });
    } else {
      // Balance unknown (client fallback) — pick by wallet availability.
      paymentMethod = walletMatches ? "payg" : "credits";
    }
  }

  const insufficientCredits =
    paymentMethod === "credits" && balance !== null && !sufficient;

  const warnings: string[] = [];
  if (!primary.provisioned) {
    warnings.push(
      `Registry not deployed on ${primary.chain.name} — the upload will use a simulated anchor.`,
    );
  }
  if (primary.chain.testnet) {
    warnings.push(
      `${primary.chain.name} is a testnet — anchors there are for testing, not permanence.`,
    );
  }
  if (paymentMethod === "payg" && !walletMatches) {
    warnings.push(
      `Connect a ${primary.chain.family} wallet to anchor on this chain.`,
    );
  }

  const wantsTestnet = resolveWantsTestnet(input);
  const factors: RecommendationFactor[] = [
    {
      type: "file",
      chunkCount,
      sizeBytes: input.file.sizeBytes,
      mimeType: input.file.mimeType,
    },
    {
      type: "intent",
      label:
        input.intent === "production"
          ? "production"
          : wantsTestnet
            ? "testnet"
            : "balanced",
    },
    {
      type: "wallet",
      family: wallet.family ?? primary.chain.family,
      connected: wallet.connected,
    },
    {
      type: "cost",
      chainId: primary.chain.id,
      usd: primary.costUsd,
      tier: primary.estimate.tier,
    },
    {
      type: "provisioning",
      chainId: primary.chain.id,
      provisioned: primary.provisioned,
    },
  ];
  if (session.authenticated && balance !== null) {
    factors.push({
      type: "credits",
      balanceUsd: Number(balance) / 1_000_000,
      requiredUsd: primary.costUsd,
      sufficient,
    });
  }
  if (paymentMethod === "byok" && byokKey) {
    factors.push({ type: "byok", providerId: byokKey.provider, keyId: byokKey.id });
  }

  const runnerUp = ranked[1];
  const confidence =
    blockers.length > 0
      ? "low"
      : primary.provisioned &&
          warnings.length === 0 &&
          (!runnerUp || primary.score - runnerUp.score >= 15)
        ? "high"
        : "medium";

  const copyContext = {
    chainName: primary.chain.name,
    chainShortName: primary.chain.shortName,
    testnet: primary.chain.testnet === true,
    provisioned: primary.provisioned,
    paymentMethod,
    byokProviderName: byokKey
      ? getByokProvider(byokKey.provider)?.name
      : undefined,
    costUsd: primary.costUsd,
    chunkCount,
    walletConnected: wallet.connected,
    walletMatches,
    insufficientCredits,
  };

  return {
    version: 1,
    headline: buildHeadline(copyContext),
    rationale: buildRationale(copyContext),
    suggested: {
      chainId: primary.chain.id,
      paymentMethod,
      byokKeyId: paymentMethod === "byok" ? byokKey?.id : undefined,
      secondaryChainIds: pickSecondaryChains(input, primary, ranked),
    },
    confidence,
    factors,
    estimatedCostUsd: Math.round(primary.costUsd * 10_000) / 10_000,
    warnings,
    blockers,
  };
};
