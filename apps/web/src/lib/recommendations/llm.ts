import "server-only";

import { getChain } from "@fileonchain/sdk";
import { env } from "@/lib/env";
import { siteConfig } from "@/lib/site";
import { formatCostUsd, getChainCostEstimates } from "@/lib/mock/costs";
import type {
  RecommendationInput,
  UploadRecommendation,
} from "@/lib/recommendations/types";

/**
 * Optional LLM copy layer for the Upload Advisor, via the OpenRouter SDK.
 * It only rephrases the deterministic engine's headline/rationale — the
 * `suggested.*` fields are rule-engine authoritative and never touched.
 * Any failure (no key, timeout, bad JSON) returns null and the template
 * copy ships as-is.
 *
 * Privacy: the prompt carries file *metadata* only (redacted basename,
 * size, MIME, chunk count) — never file bytes, wallet addresses, balances
 * beyond an aggregate USD figure, or BYOK secrets.
 */

const LLM_TIMEOUT_MS = 3_000;
const HEADLINE_MAX = 120;
const RATIONALE_MAX = 280;

/** Strip email- and UUID-looking segments from a file name before the LLM. */
const redactFileName = (name: string): string =>
  name
    .replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, "[redacted]")
    .replace(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
      "[redacted]",
    );

const SYSTEM_PROMPT = [
  "You write one-line upload recommendations for FileOnChain, an app that anchors file checksums (CIDs) on public blockchains.",
  "You are given a JSON context with the already-decided recommendation. Rewrite ONLY the copy, not the decision.",
  "Rules:",
  "- Use only chain names, costs, and facts present in the provided JSON. Never invent chains, prices, or features.",
  "- Do not recommend chains that are not in eligibleChains.",
  `- "headline" must be at most ${HEADLINE_MAX} characters, one sentence, actionable, and must mention the suggested chain and approximate cost.`,
  '- "rationale" must be 1-2 short sentences explaining why, grounded in the factors and warnings.',
  '- Respond with a JSON object: {"headline": string, "rationale": string}. No other keys, no markdown.',
].join("\n");

/** Compact, PII-free prompt context (PRD §9). */
const buildContext = (
  input: RecommendationInput,
  recommendation: UploadRecommendation,
) => {
  const chunkCount = Math.max(1, input.file.chunkCount);
  const estimates = getChainCostEstimates();
  const eligibleChains = [
    recommendation.suggested.chainId,
    ...recommendation.suggested.secondaryChainIds,
  ];
  const balance = input.session.creditBalanceMicroUsdc;
  return {
    file: {
      name: redactFileName(input.file.name),
      sizeBytes: input.file.sizeBytes,
      mimeType: input.file.mimeType,
      chunkCount,
    },
    activeChainId: input.activeChainId,
    wallet: input.wallet,
    session: {
      authenticated: input.session.authenticated,
      creditBalanceUsd:
        balance !== null ? Number(BigInt(balance)) / 1_000_000 : null,
      hasByokKey: input.session.byokKeys.length > 0,
      byokProviders: [...new Set(input.session.byokKeys.map((k) => k.provider))],
    },
    costEstimates: eligibleChains.flatMap((chainId) => {
      const estimate = estimates.find((e) => e.chainId === chainId);
      const chain = getChain(chainId);
      if (!estimate || !chain) return [];
      return [
        {
          chainId,
          chainName: chain.name,
          shortName: estimate.shortName,
          tier: estimate.tier,
          testnet: chain.testnet,
        },
      ];
    }),
    suggested: {
      ...recommendation.suggested,
      estimatedCostUsd: recommendation.estimatedCostUsd,
      estimatedCostDisplay: formatCostUsd(recommendation.estimatedCostUsd),
    },
    factors: recommendation.factors,
    warnings: recommendation.warnings,
    blockers: recommendation.blockers,
    templateCopy: {
      headline: recommendation.headline,
      rationale: recommendation.rationale,
    },
    eligibleChains,
  };
};

export const isRecommendationLlmConfigured = (): boolean =>
  Boolean(env.openRouterApiKey) && env.recommendationLlmEnabled;

/**
 * Ask the configured OpenRouter model for polished headline/rationale copy.
 * Returns null on any error so callers always have the template fallback.
 */
export const polishRecommendationCopy = async (
  input: RecommendationInput,
  recommendation: UploadRecommendation,
): Promise<{ headline: string; rationale: string } | null> => {
  if (!isRecommendationLlmConfigured()) return null;
  try {
    const { OpenRouter } = await import("@openrouter/sdk");
    const client = new OpenRouter({
      apiKey: env.openRouterApiKey,
      httpReferer: siteConfig.url,
      appTitle: siteConfig.name,
    });
    const result = await client.chat.send(
      {
        chatRequest: {
          model: env.recommendationLlmModel,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            {
              role: "user",
              content: JSON.stringify(buildContext(input, recommendation)),
            },
          ],
          temperature: 0.4,
          maxTokens: 250,
          stream: false,
          responseFormat: { type: "json_object" },
        },
      },
      { timeoutMs: LLM_TIMEOUT_MS, retries: { strategy: "none" } },
    );

    if (!result || typeof result !== "object" || !("choices" in result)) {
      return null;
    }
    const content = result.choices[0]?.message?.content;
    if (typeof content !== "string") return null;
    const parsed = JSON.parse(content) as {
      headline?: unknown;
      rationale?: unknown;
    };
    const headline =
      typeof parsed.headline === "string" ? parsed.headline.trim() : "";
    const rationale =
      typeof parsed.rationale === "string" ? parsed.rationale.trim() : "";
    if (!headline || !rationale) return null;
    return {
      headline: headline.slice(0, HEADLINE_MAX),
      rationale: rationale.slice(0, RATIONALE_MAX),
    };
  } catch (error) {
    console.warn("Upload Advisor LLM copy failed; using template copy:", error);
    return null;
  }
};
