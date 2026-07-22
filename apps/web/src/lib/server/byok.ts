import "server-only";
import type { byokKeys, ByokProvider, ByokStatus } from "@/lib/db/schema";
import { env } from "@/lib/env";

/** JSON shape for BYOK keys — never includes the (encrypted) key material. */
export const serializeByokKey = (key: typeof byokKeys.$inferSelect) => ({
  id: key.id,
  provider: key.provider,
  label: key.label,
  keyPreview: key.keyPreview,
  status: key.status,
  lastValidatedAt: key.lastValidatedAt?.toISOString() ?? null,
  revokedAt: key.revokedAt?.toISOString() ?? null,
  createdAt: key.createdAt.toISOString(),
});

/* Real provider-key validation for `autonomys-auto-drive` calls the
 * Auto Drive HTTP API directly (no SDK install — the workspace already
 * keeps chain SDKs dynamic-imported so heavy deps don't bleed into the
 * server bundle). The account probe at `/accounts/@me` authenticates by
 * `Authorization: Bearer <key>` and returns 200 on a valid key, 401/403
 * on an invalid one. 5xx/network errors throw so the route does not
 * downgrade a working user key to `invalid` because the provider is
 * having a bad day. */

/** Auto Drive HTTP API base — overridable via `AUTODRIVE_API_URL`. */
const AUTODRIVE_BASE =
  env.autodriveApiUrl ?? "https://mainnet.auto-drive.autonomys.xyz/api";

/** Validate an Auto Drive API key against the account-probe endpoint. */
const validateAutoDriveKey = async (key: string): Promise<ByokStatus> => {
  const res = await fetch(`${AUTODRIVE_BASE}/accounts/@me`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${key.trim()}`,
      "X-Auth-Provider": "apikey",
    },
    signal: AbortSignal.timeout(8_000),
    cache: "no-store",
  });
  if (res.ok) return "valid";
  if (res.status === 401 || res.status === 403) return "invalid";
  // Provider outage / rate-limit / network: throw so the calling route
  // surfaces the previous `valid` status rather than overwriting it.
  throw new Error(`Auto Drive validation failed: HTTP ${res.status}`);
};

/**
 * Validate a provider key for the given BYOK provider.
 *
 * 200 from the account probe → "valid"; 401/403 → "invalid";
 * any other status or network failure throws (the route preserves the
 * prior stored status in that case rather than silently downgrading a
 * working key).
 */
export const validateProviderKey = async (
  provider: ByokProvider,
  key: string,
): Promise<ByokStatus> => {
  if (provider !== "autonomys-auto-drive") return "invalid";
  return validateAutoDriveKey(key);
};
