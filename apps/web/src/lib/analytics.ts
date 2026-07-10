import { sendGAEvent } from "@next/third-parties/google";
import { gaId } from "@/lib/site";
import { usePreferencesStates } from "@/states/preferences";

/**
 * Typed GA4 custom events.
 *
 * Each key is a GA4 event name (snake_case) and its value is the flat param
 * shape it carries — GA4 only accepts scalar params, and none of these should
 * carry PII (CIDs and chain ids are public identifiers; file *contents* and
 * names are never sent). `trackEvent` no-ops when `NEXT_PUBLIC_GA_ID` is unset,
 * so local/dev/test runs never emit and callers don't need to guard.
 */
export interface AnalyticsEvents {
  /** A file was run through the upload/anchor flow. */
  file_upload: {
    chain_id: string;
    chain_family: string;
    file_size: number;
    status: "success" | "error";
  };
  /** A private-cache tier was purchased. */
  cache_purchase: { tier: string };
  /** A donation was submitted. */
  donation: { recipient_type: string };
  /** A validator staking action (stake / unstake / withdraw / claim) confirmed. */
  validator_staking_action: { action: string; chain_id: string };
  /** A wallet was connected. */
  wallet_connect: { family: string };
  /** A wallet was linked to (or unlinked from) the user's identity. */
  wallet_link: { family: string; action: "link" | "unlink" };
  /** A CID lookup was fired from the explorer. */
  cid_search: { source: string };
  /** A sign-in was initiated (OAuth provider id or wallet family). */
  auth_sign_in: { method: string };
  /** The user signed out. */
  auth_sign_out: Record<string, never>;
  /** An API key was created or revoked. */
  api_key: { action: "create" | "revoke" };
  /** A credit deposit was confirmed (mock for now). */
  credit_deposit: { chain_id: string; amount_usdc: number };
  /** An anchor was paid for via a payment method. */
  anchor_paid: {
    method: "payg" | "credits" | "byok";
    chain_count: number;
    chunk_count: number;
  };
  /** A real (non-simulated) anchor landed on-chain. */
  chain_anchor_success: {
    family: string;
    chain_id: string;
    payment_method: "payg" | "credits" | "byok";
    chunk_count: number;
  };
  /** An anchor fell back to the simulated flow (chain not provisioned). */
  chain_anchor_fallback_mock: { family: string; chain_id: string };
  /** An upload recommendation was rendered to the user. */
  recommendation_shown: {
    chain_id: string;
    payment_method: string;
    confidence: string;
    chunk_count: number;
    file_size: number;
    source: "api" | "fallback";
  };
  /** The user accepted the advisor's suggested chain + payment method. */
  recommendation_accepted: {
    chain_id: string;
    payment_method: string;
    chunk_count: number;
  };
  /** The user dismissed the advisor for this file session. */
  recommendation_dismissed: { chain_id: string; payment_method: string };
  /** The user changed the advisor intent (testing/production/lowest cost). */
  recommendation_intent_changed: { intent: string };
  /** An account preference was changed (field name only, never the value). */
  preference_change: { field: string };
  /** A custom RPC endpoint was saved or removed (never the URL itself). */
  rpc_endpoint: { chain_id: string; action: "set" | "remove" };
  /** An organization was created or managed. */
  organization: {
    action: "create" | "rename" | "delete" | "member_add" | "member_remove";
  };
}

type GAEventParams = Record<string, string | number | boolean | undefined>;

/**
 * Send a typed custom event to GA4 via `@next/third-parties`. Forwards to
 * `gtag('event', name, params)`; silently does nothing when GA is disabled.
 */
export function trackEvent<K extends keyof AnalyticsEvents>(
  name: K,
  params: AnalyticsEvents[K]
): void {
  if (!gaId) return;
  // Respect the account-level analytics-cookies opt-out.
  if (!usePreferencesStates.getState().analyticsEnabled) return;
  sendGAEvent("event", name, params as GAEventParams);
}
