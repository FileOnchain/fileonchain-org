// Webpack stub used by next.config.ts to short-circuit auto-dag-data's
// `dist/encryption/index.js` re-export (which pulls in @peculiar/webcrypto
// and node:crypto). The uploader never exercises encryption, but
// `dist/index.js` does `export * from './encryption/index.js'` and
// `dist/utils/file.js` does `import { decryptFile } from '../encryption/index.js'`,
// so we re-export the same names to keep the import graph well-formed. The
// values are never invoked at runtime by the uploader path; if anything
// does touch them, they'll throw a clear error rather than crash on
// evaluation like the real module does.
export const crypto = undefined as never;
export const ENCRYPTING_CHUNK_SIZE = 0;
export const ENCRYPTED_CHUNK_SIZE = 0;

export async function getKeyFromPassword(): Promise<never> {
  throw new Error("Encryption is not available in the browser bundle");
}

export async function* encryptFile(): AsyncGenerator<never, void, never> {
  throw new Error("Encryption is not available in the browser bundle");
}

export async function* decryptFile(): AsyncGenerator<never, void, never> {
  throw new Error("Decryption is not available in the browser bundle");
}