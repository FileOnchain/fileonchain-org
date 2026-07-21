/**
 * Vitest setup. Stub environment variables that the production
 * `env` module reads lazily so unit tests don't fail the gate on a
 * missing secret. The values are deterministic and not used to
 * encrypt real data — production never reads these in test mode.
 */

const THIRTY_TWO_BYTES_BASE64 = Buffer.from(
  "01234567890123456789012345678901",
  "utf8",
).toString("base64");

process.env.BYOK_ENCRYPTION_KEY ??= THIRTY_TWO_BYTES_BASE64;
process.env.AUTH_SECRET ??= "test-auth-secret-do-not-use-in-prod";
process.env.CRON_SECRET ??= "test-cron-secret";
