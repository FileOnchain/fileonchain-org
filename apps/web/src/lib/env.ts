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
  /** Platform id the server worker attributes anchors to (payload
   * attribution only); defaults to FileOnChain's platform 1. */
  get anchorPlatformId(): string {
    return process.env.ANCHOR_PLATFORM_ID ?? "1";
  },
  /** Funded server signers for the credits/BYOK anchor worker — optional;
   * absent keys keep the worker on the deterministic mock. */
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
  /** Cloud evidence surface (POST/GET /api/v1/evidence, /agent-runs,
   * /verify, /retention + /cloud/* webapp pages). Defaults OFF; set
   * FILEONCHAIN_CLOUD_EVIDENCE_ENABLED=1 to open the surface. */
  get cloudEvidenceEnabled(): boolean {
    return process.env.FILEONCHAIN_CLOUD_EVIDENCE_ENABLED === "1";
  },
  /** Projects, per-project quotas, and per-project Cloud signers (the
   * sub-org tenancy surface). Set FILEONCHAIN_CLOUD_TENANCY_ENABLED=1 to
   * open `/cloud/projects/*`, the project-scoped API keys, and the quota
   * gates on `/api/v1/evidence` / `/api/v1/agent-runs` / `/api/v1/anchor`. */
  get cloudTenancyEnabled(): boolean {
    return process.env.FILEONCHAIN_CLOUD_TENANCY_ENABLED === "1";
  },
  /** Webhooks (`/api/v1/webhooks/*` + `/cloud/webhooks` + the
   * `webhooks-drain` cron). Set FILEONCHAIN_CLOUD_WEBHOOKS_ENABLED=1 to
   * open the surface and start emitting events. */
  get cloudWebhooksEnabled(): boolean {
    return process.env.FILEONCHAIN_CLOUD_WEBHOOKS_ENABLED === "1";
  },
  /** Bulk `.evidence.json` exports (`/api/v1/exports/*` +
   * `/cloud/exports` + the `exports-sweep` cron). Set
   * FILEONCHAIN_CLOUD_EXPORTS_ENABLED=1 to open the surface. */
  get cloudExportsEnabled(): boolean {
    return process.env.FILEONCHAIN_CLOUD_EXPORTS_ENABLED === "1";
  },
  /** Compliance reports + SLAs (`/api/v1/compliance-reports/*`,
   * `/api/v1/sla`, `/cloud/compliance` + the
   * `compliance-reports-build` cron). Set
   * FILEONCHAIN_CLOUD_COMPLIANCE_ENABLED=1 to open the surface. */
  get cloudComplianceEnabled(): boolean {
    return process.env.FILEONCHAIN_CLOUD_COMPLIANCE_ENABLED === "1";
  },
  /** Shared secret guarding the scheduled cron routes. Vercel Cron sends it
   * as `Authorization: Bearer $CRON_SECRET`. Absent = the cron route rejects
   * every request (the sweep can still be run via the CLI). */
  get cronSecret(): string | undefined {
    return process.env.CRON_SECRET;
  },
  /** Rate-limit overrides for the `/api/v1/*` API-key surface. Absent =
   *  the hard-coded defaults in `lib/server/rate-limit.ts` apply. The
   *  values are strings (numbers-as-strings from the env) so they can be
   *  parsed via `Number(...)` and fall back to the defaults on NaN. */
  get rateLimitV1PerMin(): string | undefined {
    return process.env.RATE_LIMIT_V1_PER_MIN;
  },
  get rateLimitV1AnchorPerMin(): string | undefined {
    return process.env.RATE_LIMIT_V1_ANCHOR_PER_MIN;
  },
  get rateLimitV1EvidencePerMin(): string | undefined {
    return process.env.RATE_LIMIT_V1_EVIDENCE_PER_MIN;
  },
  get rateLimitV1IpPerMin(): string | undefined {
    return process.env.RATE_LIMIT_V1_IP_PER_MIN;
  },
  /** Override for the Auto Drive account-probe endpoint used by
   * `validateProviderKey` in `lib/server/byok.ts`. Absent = the public
   * mainnet base URL. Set `AUTODRIVE_API_URL` to point at a staging
   * mirror in tests. */
  get autodriveApiUrl(): string | undefined {
    return process.env.AUTODRIVE_API_URL;
  },
  /** Treasury BIP-39 mnemonic that owns the per-user deposit-address tree.
   * Absent = `/api/credits/deposit` rejects with 503. Set
   * `DEPOSIT_TREASURY_MNEMONIC` to a fresh 24-word seed; the treasury
   * sweeps the derived addresses into a hot wallet. */
  get depositTreasuryMnemonic(): string | undefined {
    return process.env.DEPOSIT_TREASURY_MNEMONIC;
  },
};
