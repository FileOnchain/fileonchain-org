/**
 * AES-GCM (WebCrypto) encryption stub for the private cache feature.
 *
 * Real production impl: derive the key from a wallet signature via
 * `personal_sign` so users don't lose access when they clear browser
 * storage. This stub keeps keys in memory only — for the mock flow.
 */

const enc = new TextEncoder();
const dec = new TextDecoder();

const ALGORITHM = "AES-GCM";
const KEY_LENGTH = 256;

/* TODO: production — key derived from wallet signature, not stored client-side */

const generateRawKey = async (): Promise<CryptoKey> => {
  return crypto.subtle.generateKey(
    { name: ALGORITHM, length: KEY_LENGTH },
    true,
    ["encrypt", "decrypt"],
  );
};

const exportKeyB64 = async (key: CryptoKey): Promise<string> => {
  const raw = await crypto.subtle.exportKey("raw", key);
  const bytes = new Uint8Array(raw);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
};

const importKeyB64 = async (b64: string): Promise<CryptoKey> => {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return crypto.subtle.importKey("raw", bytes, { name: ALGORITHM }, true, [
    "encrypt",
    "decrypt",
  ]);
};

/**
 * Encrypt a Blob and return the encrypted bytes + the base64 key. The caller
 * is responsible for storing the key alongside the cache entry ID.
 */
export const encryptBlob = async (
  data: Blob,
): Promise<{ ciphertext: Blob; key: string; iv: string }> => {
  const key = await generateRawKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const buffer = await data.arrayBuffer();
  const ct = await crypto.subtle.encrypt({ name: ALGORITHM, iv }, key, buffer);
  const exportedKey = await exportKeyB64(key);
  return {
    ciphertext: new Blob([ct], { type: "application/octet-stream" }),
    key: exportedKey,
    iv: btoa(String.fromCharCode(...iv)),
  };
};

/**
 * Decrypt a previously-encrypted Blob with the stored base64 key + iv.
 */
export const decryptBlob = async (
  ciphertext: Blob,
  keyB64: string,
  ivB64: string,
): Promise<Blob> => {
  const key = await importKeyB64(keyB64);
  const ivBin = atob(ivB64);
  const iv = new Uint8Array(ivBin.length);
  for (let i = 0; i < ivBin.length; i++) iv[i] = ivBin.charCodeAt(i);
  const buffer = await ciphertext.arrayBuffer();
  const pt = await crypto.subtle.decrypt({ name: ALGORITHM, iv }, key, buffer);
  return new Blob([pt]);
};

/**
 * Convenience helper used by the cache layer to encrypt a File object
 * directly.
 */
export const encryptFile = async (file: File): Promise<{ ciphertext: Blob; key: string; iv: string }> => {
  return encryptBlob(file);
};

/**
 * Convenience helper used by the cache layer to decrypt back to a File.
 */
export const decryptFile = async (
  ciphertext: Blob,
  key: string,
  iv: string,
  filename: string,
  type: string,
): Promise<File> => {
  const blob = await decryptBlob(ciphertext, key, iv);
  return new File([blob], filename, { type });
};

/**
 * No-op hash used by the cache layer for size labels — the real impl will
 * use a content hash (e.g. SHA-256).
 */
export const fakeContentHash = (data: string | Uint8Array): string => {
  const input = typeof data === "string" ? enc.encode(data) : data;
  let h1 = 0;
  let h2 = 0;
  for (let i = 0; i < input.length; i++) {
    h1 = ((h1 << 5) - h1 + input[i]) >>> 0;
    h2 = ((h2 << 7) ^ input[i]) >>> 0;
  }
  return `0x${h1.toString(16).padStart(8, "0")}${h2.toString(16).padStart(8, "0")}`;
};

export { enc, dec };