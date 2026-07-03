import { sendGAEvent } from "@next/third-parties/google";
import { gaId } from "@/lib/site";

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
  /** A wallet was connected. */
  wallet_connect: { family: string };
  /** A wallet was linked to (or unlinked from) the user's identity. */
  wallet_link: { family: string; action: "link" | "unlink" };
  /** A CID lookup was fired from the explorer. */
  cid_search: { source: string };
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
  sendGAEvent("event", name, params as GAEventParams);
}
