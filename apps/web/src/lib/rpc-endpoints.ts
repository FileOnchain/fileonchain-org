import type { ChainConfig, ChainFamily, ChainId } from "@fileonchain/sdk";

/**
 * Shared custom-RPC vocabulary — safe to import from both server code (API
 * validation, anchor worker) and client code (Zustand store, dashboard
 * forms). Keep it dependency-free so it never drags server modules into the
 * bundle.
 *
 * A custom RPC overrides the registry default wherever *our* code dials the
 * chain (browser Solana/Substrate/Cosmos senders, the server anchor worker).
 * Families whose browser sends go through the injected wallet's own node are
 * unaffected, as are the Hedera/Cardano server signers (they don't read
 * `rpcUrl`) and the pre-identity auth verifiers.
 */

export type CustomRpcMap = Partial<Record<ChainId, string>>;

export const RPC_URL_MAX_LENGTH = 2048;

/** Most overrides a single user may store — a sanity cap, not a product limit. */
export const MAX_RPC_OVERRIDES = 64;

/** Families whose server signers ignore `rpcUrl` — hidden from the picker. */
const NON_CONFIGURABLE_FAMILIES: readonly ChainFamily[] = ["hedera", "cardano"];

export const isRpcConfigurableFamily = (family: ChainFamily): boolean =>
  !NON_CONFIGURABLE_FAMILIES.includes(family);

/** Substrate connects over websockets; every other family speaks HTTPS. */
export const allowedProtocolFor = (family: ChainFamily): "wss:" | "https:" =>
  family === "substrate" ? "wss:" : "https:";

const PRIVATE_HOST_SUFFIXES = [".localhost", ".local", ".internal"];

/**
 * Reject hostnames that resolve to private or loopback networks so a stored
 * override can't be used to probe internal services from the anchor worker
 * (SSRF). Hostname checks can't fully prevent DNS rebinding, but the worker
 * only ever sends signed transactions to the endpoint, so this is an
 * acceptable bar.
 */
const isPrivateHost = (hostname: string): boolean => {
  // WHATWG URL keeps the square brackets on IPv6 hostnames ("[::1]").
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || PRIVATE_HOST_SUFFIXES.some((s) => host.endsWith(s))) {
    return true;
  }

  if (host.includes(":")) {
    if (host === "::" || host === "::1") return true;
    if (host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80")) {
      return true;
    }
    // Mapped IPv4 — URL canonicalizes "::ffff:10.0.0.1" to hex ("::ffff:a00:1").
    if (host.startsWith("::ffff:")) {
      const tail = host.slice("::ffff:".length);
      if (tail.includes(".")) return isPrivateHost(tail);
      const groups = tail.split(":").map((g) => parseInt(g || "0", 16));
      if (groups.length === 2 && groups.every((g) => Number.isFinite(g))) {
        return isPrivateHost(
          `${groups[0] >> 8}.${groups[0] & 255}.${groups[1] >> 8}.${groups[1] & 255}`,
        );
      }
      return true; // unparseable mapped form — refuse rather than trust it
    }
    return false;
  }

  const octets = host.split(".").map(Number);
  const isIpv4 = octets.length === 4 && octets.every((n) => Number.isInteger(n) && n >= 0 && n <= 255);
  if (isIpv4) {
    const [a, b] = octets;
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168)
    );
  }

  // Dotless names (e.g. bare service names) only resolve on internal networks.
  return !host.includes(".");
};

/**
 * Validate an untrusted RPC URL for a chain family. Returns an error message,
 * or `null` when the URL is acceptable.
 */
export const validateRpcUrl = (family: ChainFamily, raw: string): string | null => {
  const value = raw.trim();
  if (!value) return "RPC URL is required";
  if (value.length > RPC_URL_MAX_LENGTH) {
    return `RPC URL must be at most ${RPC_URL_MAX_LENGTH} characters`;
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return "Invalid URL";
  }

  const protocol = allowedProtocolFor(family);
  if (url.protocol !== protocol) {
    return `Expected a ${protocol.slice(0, -1)}:// URL for ${family} chains`;
  }
  if (!url.hostname || isPrivateHost(url.hostname)) {
    return "RPC URL must point at a public host";
  }
  if (url.username || url.password) {
    return "RPC URL must not embed credentials";
  }
  return null;
};

/**
 * Return the chain with its `rpcUrl` swapped for the user's override, or the
 * registry object untouched when no override exists. Never mutates `CHAINS`.
 */
export const withRpcOverride = (
  chain: ChainConfig,
  overrides: CustomRpcMap,
): ChainConfig => {
  const rpcUrl = overrides[chain.id];
  return rpcUrl ? { ...chain, rpcUrl } : chain;
};
