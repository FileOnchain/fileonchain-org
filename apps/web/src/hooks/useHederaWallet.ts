"use client";

import { useCallback, useState } from "react";
import { useWalletStates } from "@/states/wallet";
import { useHederaAppKit } from "@/components/auth/HederaAppKitProvider";
import { trackEvent } from "@/lib/analytics";

/**
 * Hedera wallet sign-in via Reown AppKit + HederaAdapter (WalletConnect).
 *
 * The adapter's `signMessage()` returns a base64-encoded `SignatureMap`
 * protobuf carrying the wallet's signature over the canonical
 * `"\x19Hedera Signed Message:\n" ‖ len(message) ‖ message` envelope — see
 * the HIP-820 spec and the verifier at
 * `apps/web/src/lib/auth/verifiers/hedera.ts`.
 *
 * The adapter does NOT include the signer's public key in the response, so
 * we fetch it from the Hedera mirror node at connect time:
 *   GET https://{network}.mirrornode.hedera.com/api/v1/accounts/{accountId}
 * The returned `key.key` is the hex-encoded public key bytes (or the
 * protobuf-wrapped equivalent — `PublicKey.fromBytes` accepts both). The
 * fetch is unauthenticated and rate-limited to 50 RPS per IP. Cached in
 * module-scope for the duration of the page.
 */

interface HederaAccountInfo {
  key?: {
    _type?: "ED25519" | "ECDSA_SECP256K1" | "ProtobufEncoded";
    key?: string;
  } | null;
}

const MIRROR_NODE_BY_NETWORK: Record<string, string> = {
  mainnet: "https://mainnet.mirrornode.hedera.com",
  testnet: "https://testnet.mirrornode.hedera.com",
  previewnet: "https://previewnet.mirrornode.hedera.com",
};

/** `hedera:testnet:0.0.12345` → network=testnet, accountId=`0.0.12345`. */
const splitHederaId = (
  raw: string,
): { network: string; accountId: string } | null => {
  const match = raw.match(/^(hedera:(mainnet|testnet|previewnet)):(.+)$/i);
  if (!match) return null;
  return { network: match[2].toLowerCase(), accountId: match[3] };
};

const fetchPublicKey = async (
  rawAddress: string,
): Promise<string | null> => {
  const split = splitHederaId(rawAddress);
  if (!split) return null;
  const base = MIRROR_NODE_BY_NETWORK[split.network];
  if (!base) return null;
  const url = `${base}/api/v1/accounts/${encodeURIComponent(split.accountId)}`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) return null;
  const info = (await res.json()) as HederaAccountInfo;
  return info.key?.key ?? null;
};

export interface HederaSignResult {
  /** Base64-encoded SignatureMap protobuf (HIP-820). */
  signature: string;
  /** Raw Hedera account id, e.g. `hedera:testnet:0.0.12345`. */
  address: string;
  /** Hex-encoded public key bytes (raw or protobuf-wrapped). */
  publicKey: string;
}

export const useHederaWallet = () => {
  const { adapter, error: appKitError } = useHederaAppKit();
  const hederaAddress = useWalletStates((s) => s.hederaAddress);
  const setHederaAddress = useWalletStates((s) => s.setHederaAddress);
  const setChainFamily = useWalletStates((s) => s.setChainFamily);

  const [publicKey, setPublicKey] = useState<string | null>(null);

  const getInjectedProvider = (): unknown | null => {
    // Hedera has no injected provider standard (`window.hedera` doesn't
    // exist); the HederaAdapter routes through WalletConnect only.
    return null;
  };

  const ensureReady = useCallback((): NonNullable<typeof adapter> => {
    if (appKitError) throw new Error(appKitError);
    if (!adapter) {
      throw new Error(
        "Hedera wallet pairing is not initialized yet — check NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID.",
      );
    }
    return adapter as NonNullable<typeof adapter>;
  }, [adapter, appKitError]);

  const connect = useCallback(async (): Promise<string> => {
    if (hederaAddress) return hederaAddress;
    const ad = ensureReady();
    void getInjectedProvider();
    // adapter.connect opens the WalletConnect modal — the user picks HashPack
    // (or any other Reown-compatible Hedera wallet), the adapter pairs via
    // WC, and resolves with the connected account.
    const result = await ad.connect({
      id: "walletConnect",
      type: "WALLET_CONNECT",
      chain: "hedera",
    });
    const address = result.address;
    if (!address) {
      throw new Error("Hedera WalletConnect handshake did not return an account");
    }
    setHederaAddress(address);
    setChainFamily("hedera");
    setPublicKey(null);
    // Fetch the signer's publicKey from the mirror node and cache it for the
    // session — the adapter doesn't return it from signMessage.
    const pk = await fetchPublicKey(address);
    if (!pk) {
      throw new Error(
        `Could not fetch the Hedera public key for ${address} from the mirror node.`,
      );
    }
    setPublicKey(pk);
    trackEvent("wallet_connect", { family: "hedera" });
    return address;
  }, [hederaAddress, ensureReady, setHederaAddress, setChainFamily]);

  const disconnect = useCallback(async () => {
    try {
      if (adapter) await adapter.disconnect();
    } catch {
      // Already disconnected — clear local state anyway.
    }
    setHederaAddress(null);
    setChainFamily(null);
    setPublicKey(null);
  }, [adapter, setHederaAddress, setChainFamily]);

  const signMessage = useCallback(
    async (message: string): Promise<HederaSignResult> => {
      const ad = ensureReady();
      const address = hederaAddress;
      if (!address) {
        throw new Error("Connect a Hedera wallet before signing");
      }
      const result = await ad.signMessage({ message, address });
      if (!publicKey) {
        // Should have been populated by connect(), but fall back to a fresh
        // mirror-node lookup if the page reloaded mid-session.
        const pk = await fetchPublicKey(address);
        if (!pk) {
          throw new Error(
            "Hedera public key unavailable — connect the wallet again.",
          );
        }
        setPublicKey(pk);
        return { signature: result.signature, address, publicKey: pk };
      }
      return { signature: result.signature, address, publicKey };
    },
    [ensureReady, hederaAddress, publicKey],
  );

  return {
    address: hederaAddress,
    connect,
    disconnect,
    signMessage,
  };
};