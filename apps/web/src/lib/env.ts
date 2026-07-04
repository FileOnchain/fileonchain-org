import "server-only";

/**
 * Server-only environment access. Mirrors the `lib/site.ts` pattern but the
 * required values are read lazily (at first use, not module load) so
 * `pnpm build` stays green in environments with no secrets configured.
 */

const requireEnv = (name: string): string => {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable ${name} — see apps/web/.env.example`,
    );
  }
  return value;
};

export const env = {
  /** 32-byte base64 key used to encrypt BYOK provider keys at rest. */
  get byokEncryptionKey(): string {
    return requireEnv("BYOK_ENCRYPTION_KEY");
  },
  /** OAuth providers are optional — absent creds hide the provider button. */
  get authGoogleId(): string | undefined {
    return process.env.AUTH_GOOGLE_ID;
  },
  get authGoogleSecret(): string | undefined {
    return process.env.AUTH_GOOGLE_SECRET;
  },
  get authGithubId(): string | undefined {
    return process.env.AUTH_GITHUB_ID;
  },
  get authGithubSecret(): string | undefined {
    return process.env.AUTH_GITHUB_SECRET;
  },
  /** Funded server signers for the credits/BYOK anchor worker — optional;
   * absent keys keep the worker on the deterministic mock. */
  get anchorEvmPrivateKey(): string | undefined {
    return process.env.ANCHOR_EVM_PRIVATE_KEY;
  },
  get anchorSubstrateSeed(): string | undefined {
    return process.env.ANCHOR_SUBSTRATE_SEED;
  },
};
