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

/* TODO: wire to real provider validation — for autonomys-auto-drive, call the
 * Auto Drive API (@autonomys/auto-drive `createAutoDriveApi({ apiKey })` +
 * an account/limits read) and report the real remaining credit. */

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
