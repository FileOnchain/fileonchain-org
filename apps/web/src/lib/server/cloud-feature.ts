import "server-only";
import { env } from "@/lib/env";

/**
 * Single source of truth for the Cloud evidence surface flag. Every new
 * `/api/v1/*` evidence route and every `/cloud/*` page imports this so the
 * short-circuit behavior is consistent: when OFF, routes return 503 with a
 * structured error body and pages render the Planned empty state.
 *
 * The flag is read on each call (lazy `env.cloudEvidenceEnabled`) so
 * flipping the env at runtime via a deploy does not require a server
 * restart.
 */
export const isCloudEvidenceEnabled = (): boolean => env.cloudEvidenceEnabled;

/** The "this surface is not enabled" body returned by every gated route. */
export const CLOUD_DISABLED_BODY = {
  error: "Cloud evidence surface is not enabled",
  code: "not_implemented",
} as const;
