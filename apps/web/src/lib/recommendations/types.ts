import type { ChainFamily, ChainId } from "@fileonchain/sdk";
import type { UploadPaymentMethod } from "@/hooks/useFileUploader";

/**
 * Upload Advisor — shared vocabulary for the chain & payment recommender.
 * Safe to import from both client code (fallback engine, UI) and server
 * code (API route, LLM layer). Keep it dependency-light: only types from
 * the SDK and the uploader's payment-method union.
 */

/** User intent from the expanded advisor UI. */
export type UploadIntent = "testnet" | "production" | "lowest_cost" | "balanced";

export type RecommendationConfidence = "high" | "medium" | "low";

/** Where the rendered recommendation came from. */
export type RecommendationSource = "api" | "fallback";

/** Deterministic facts backing the recommendation ("Why?" drawer). */
export type RecommendationFactor =
  | { type: "cost"; chainId: ChainId; usd: number; tier: string }
  | { type: "wallet"; family: ChainFamily; connected: boolean }
  | { type: "credits"; balanceUsd: number; requiredUsd: number; sufficient: boolean }
  | { type: "byok"; providerId: string; keyId: string }
  | { type: "file"; chunkCount: number; sizeBytes: number; mimeType: string }
  | { type: "provisioning"; chainId: ChainId; provisioned: boolean }
  | { type: "intent"; label: "testnet" | "production" | "balanced" };

/** Hard blocker the user must resolve before the suggested config works. */
export interface RecommendationBlocker {
  code: "insufficient_credits" | "no_wallet";
  message: string;
  /** Optional in-app link resolving the blocker (e.g. /dashboard/credits). */
  href?: string;
}

export interface UploadRecommendation {
  /** Schema version for forward compatibility. */
  version: 1;
  /** Primary one-liner for the collapsed UI (≤ 120 chars). */
  headline: string;
  /** 1–2 sentence rationale (LLM-polished or template). */
  rationale: string;
  /** Apply-on-accept settings. */
  suggested: {
    chainId: ChainId;
    paymentMethod: UploadPaymentMethod;
    byokKeyId?: string;
    /** Redundancy candidates — informational in v1 (no multi-anchor UI). */
    secondaryChainIds: ChainId[];
  };
  confidence: RecommendationConfidence;
  factors: RecommendationFactor[];
  /** Estimated cost for the suggested primary chain (USD). */
  estimatedCostUsd: number;
  /** Non-blocking caveats (testnet impermanence, simulated anchor, …). */
  warnings: string[];
  blockers: RecommendationBlocker[];
}

/** A BYOK key as the engine sees it — never the secret itself. */
export interface RecommendationByokKey {
  id: string;
  provider: string;
  label: string;
}

/** Account context. Server-derived when authenticated; empty for guests. */
export interface RecommendationSessionContext {
  authenticated: boolean;
  /** Credit balance in micro-USDC as a decimal string, null when unknown. */
  creditBalanceMicroUsdc: string | null;
  /** Valid (non-revoked) BYOK keys. */
  byokKeys: RecommendationByokKey[];
}

/** Full input to the deterministic rule engine. */
export interface RecommendationInput {
  file: {
    /** Basename only — no path segments. */
    name: string;
    sizeBytes: number;
    /** May be "" when the browser can't detect one. */
    mimeType: string;
    chunkCount: number;
  };
  activeChainId: ChainId;
  wallet: {
    connected: boolean;
    family: ChainFamily | null;
  };
  intent: UploadIntent;
  session: RecommendationSessionContext;
}

/** POST /api/recommendations/upload body — session context is server-derived. */
export interface UploadRecommendationRequest {
  file: RecommendationInput["file"];
  activeChainId: ChainId;
  wallet: RecommendationInput["wallet"];
  intent?: UploadIntent;
}
