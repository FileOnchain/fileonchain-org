import "server-only";
import type { byokKeys, ByokProvider, ByokStatus } from "@/lib/db/schema";

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

/* DEFERRED: real provider-key validation for `autonomys-auto-drive` is
 * intentionally a deterministic mock until we add `@autonomys/auto-drive`
 * as a dependency and call `createAutoDriveApi({ apiKey })` plus an
 * account/limits read against the ai3.storage API. Tracking issue: see
 * the "Productionize mocked chain reads" PR follow-ups in the team
 * backlog. The mock below is the documented contract — both `POST
 * /api/byok` (add) and `POST /api/byok/[id]/validate` (revalidate) paths
 * exercise the success and failure branches without a real provider
 * key, so local dev keeps working without secrets. */

/**
 * MOCK provider-key validation. Deterministic: plausible-length keys pass,
 * so local flows can exercise both outcomes without a real provider account.
 */
export const validateProviderKey = async (
  _provider: ByokProvider,
  key: string,
): Promise<ByokStatus> => {
  await new Promise((resolve) => setTimeout(resolve, 300));
  return key.trim().length >= 20 ? "valid" : "invalid";
};
