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
  /** Platform id the server worker attributes anchors to (fee split);
   * defaults to FileOnChain's platform 1. */
  get anchorPlatformId(): string {
    return process.env.ANCHOR_PLATFORM_ID ?? "1";
  },
  /** FOC tip per file anchor in token base units; absent means the
   * registry's on-chain minimum tip. */
  get anchorTipBaseUnits(): bigint | undefined {
    const raw = process.env.ANCHOR_TIP_BASE_UNITS;
    return raw ? BigInt(raw) : undefined;
  },
  /** Funded server signers for the credits/BYOK anchor worker — optional;
   * absent keys keep the worker on the deterministic mock. On propose-
   * provisioned chains the signer also needs FOC for tips and bonds. */
  get anchorEvmPrivateKey(): string | undefined {
    return process.env.ANCHOR_EVM_PRIVATE_KEY;
  },
  get anchorSubstrateSeed(): string | undefined {
    return process.env.ANCHOR_SUBSTRATE_SEED;
  },
  get anchorSolanaSecretKey(): string | undefined {
    return process.env.ANCHOR_SOLANA_SECRET_KEY;
  },
  get anchorAptosPrivateKey(): string | undefined {
    return process.env.ANCHOR_APTOS_PRIVATE_KEY;
  },
  get anchorCosmosMnemonic(): string | undefined {
    return process.env.ANCHOR_COSMOS_MNEMONIC;
  },
  get anchorSuiPrivateKey(): string | undefined {
    return process.env.ANCHOR_SUI_PRIVATE_KEY;
  },
  /** Starknet accounts are contracts — the worker needs the deployed
   * account address alongside its signing key. */
  get anchorStarknetPrivateKey(): string | undefined {
    return process.env.ANCHOR_STARKNET_PRIVATE_KEY;
  },
  get anchorStarknetAccount(): string | undefined {
    return process.env.ANCHOR_STARKNET_ACCOUNT;
  },
  get anchorNearPrivateKey(): string | undefined {
    return process.env.ANCHOR_NEAR_PRIVATE_KEY;
  },
  get anchorNearAccountId(): string | undefined {
    return process.env.ANCHOR_NEAR_ACCOUNT_ID;
  },
  get anchorTronPrivateKey(): string | undefined {
    return process.env.ANCHOR_TRON_PRIVATE_KEY;
  },
  get anchorCardanoSigningKey(): string | undefined {
    return process.env.ANCHOR_CARDANO_SIGNING_KEY;
  },
  /** Cardano tx building needs a chain data provider; Blockfrost keys are
   * per-network, so this must match the chains being anchored. */
  get anchorCardanoBlockfrostKey(): string | undefined {
    return process.env.ANCHOR_CARDANO_BLOCKFROST_KEY;
  },
  get anchorTonMnemonic(): string | undefined {
    return process.env.ANCHOR_TON_MNEMONIC;
  },
  get anchorTonApiKey(): string | undefined {
    return process.env.ANCHOR_TON_API_KEY;
  },
  get anchorHederaOperatorId(): string | undefined {
    return process.env.ANCHOR_HEDERA_OPERATOR_ID;
  },
  get anchorHederaPrivateKey(): string | undefined {
    return process.env.ANCHOR_HEDERA_PRIVATE_KEY;
  },
  /** Upload Advisor LLM copy layer — optional; absent key means template
   * copy only, the deterministic rule engine always runs. */
  get openRouterApiKey(): string | undefined {
    return process.env.OPENROUTER_API_KEY;
  },
  get recommendationLlmModel(): string {
    return process.env.RECOMMENDATION_LLM_MODEL || "openai/gpt-4o-mini";
  },
  /** Set RECOMMENDATION_LLM_ENABLED=0 to force deterministic copy even
   * when an OpenRouter key is present. */
  get recommendationLlmEnabled(): boolean {
    return process.env.RECOMMENDATION_LLM_ENABLED !== "0";
  },
};
