import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { env } from "@/lib/env";

/**
 * AES-256-GCM sealing for BYOK provider keys at rest. Server-only — distinct
 * from the client-side `lib/crypto/aes.ts` stub used by the private cache.
 * Sealed format: `iv.ciphertext.tag`, each segment base64.
 */

const getKey = (): Buffer => {
  const key = Buffer.from(env.byokEncryptionKey, "base64");
  if (key.length !== 32) {
    throw new Error(
      "BYOK_ENCRYPTION_KEY must be 32 bytes of base64 (openssl rand -base64 32)",
    );
  }
  return key;
};

export const sealSecret = (plaintext: string): string => {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  return [iv, ciphertext, cipher.getAuthTag()]
    .map((part) => part.toString("base64"))
    .join(".");
};

export const openSecret = (sealed: string): string => {
  const [iv, ciphertext, tag] = sealed.split(".");
  if (!iv || !ciphertext || !tag) throw new Error("Malformed sealed secret");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    getKey(),
    Buffer.from(iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
};
