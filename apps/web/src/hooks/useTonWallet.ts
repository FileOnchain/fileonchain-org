"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  useTonAddress,
  useTonConnectUI,
  type SignDataPayload,
} from "@tonconnect/ui-react";
import { useWalletStates } from "@/states/wallet";
import { trackEvent } from "@/lib/analytics";

/**
 * Injected `window.ton` JSON-RPC provider (OpenMask / MyTonWallet extensions).
 * Acts as a fallback when no TON Connect UI is available — sign-in still
 * needs TON Connect, but the anchor sender (apps/web/src/lib/anchor/ton.ts)
 * rides the injected `ton_sendTransaction` path.
 */
interface TonProvider {
  isOpenMask?: boolean;
  /** OpenMask / MyTonWallet JSON-RPC style entry point. */
  send(method: "ton_requestAccounts"): Promise<string[]>;
  /** Comment-carrying transfer flow — used by the anchor sender. */
  send(
    method: "ton_sendTransaction",
    params: [{ to: string; value: string; dataType?: "text"; data?: string }],
  ): Promise<unknown>;
}

declare global {
  interface Window {
    ton?: TonProvider;
  }
}

export interface TonSignResult {
  /** Base64-encoded Ed25519 signature. */
  signature: string;
  /** Raw `<workchain>:<hex>` wallet address. */
  address: string;
  /** Unix epoch seconds at signing time — embedded in the digest. */
  timestamp: number;
  /** App domain bound into the signature. */
  domain: string;
  /** Echoed payload object. */
  payload: SignDataPayload;
  /** Ed25519 public key (hex, no `0x`) — required for verifier. */
  publicKey: string;
}

type ConnectOutcome = { ok: true; address: string } | { ok: false; error: Error };
interface InflightConnect {
  resolve: (outcome: ConnectOutcome) => void;
  timeout: ReturnType<typeof setTimeout>;
}

/**
 * useTonWallet — TON Connect primary path (`signData` over the wallet-standard
 * envelope), `window.ton` only as the anchor fallback. Sign-in for TON goes
 * through TON Connect because only the connect handshake binds the user's
 * ed25519 publicKey into the proof payload.
 *
 * The signing envelope is reconstructed server-side in
 * `apps/web/src/lib/auth/verifiers/ton.ts` — the proof carries `signature`,
 * `publicKey`, `timestamp`, `domain`, and the verbatim message payload.
 */
export const useTonWallet = () => {
  const [tcui] = useTonConnectUI();
  // Raw `<workchain>:<hex>` form is what the verifier signs against.
  // We deliberately do NOT use the user-friendly `useTonAddress()` (Base64)
  // anywhere — it'd mismatch the verifier's digest binding.
  const rawAddress = useTonAddress(false);
  const tonAddress = useWalletStates((s) => s.tonAddress);
  const setTonAddress = useWalletStates((s) => s.setTonAddress);
  const setChainFamily = useWalletStates((s) => s.setChainFamily);

  // Hold the in-flight connect() so onStatusChange can resolve it directly.
  // Bumped on every new connect() / unmount so stale callbacks no-op.
  const inflightRef = useRef<InflightConnect | null>(null);
  const generationRef = useRef(0);

  const getInjectedProvider = (): TonProvider | null => {
    if (typeof window === "undefined") return null;
    return window.ton ?? null;
  };

  const connect = useCallback(async (): Promise<string> => {
    if (rawAddress) {
      // Restored session — re-affirm the family selection so a prior
      // disconnect that cleared chainFamily but kept tonAddress doesn't
      // leave the wallet store stale.
      setChainFamily("ton");
      return rawAddress;
    }
    // Open the TON Connect modal — the user picks a wallet (mobile QR,
    // browser extension, or in-wallet browser). The `restoreConnection`
    // option on TonConnectUIProvider auto-restores prior sessions on mount,
    // so a refresh of a connected session flows straight to the address path.
    try {
      tcui.openModal();
    } catch (err) {
      console.warn(
        "TON Connect openModal failed, falling back to injected provider",
        err,
      );
      const injected = getInjectedProvider();
      if (!injected) {
        throw new Error(
          "No TON Connect wallet detected — install Tonkeeper, MyTonWallet, or OpenMask.",
        );
      }
      const [address] = await injected.send("ton_requestAccounts");
      setTonAddress(address);
      setChainFamily("ton");
      trackEvent("wallet_connect", { family: "ton" });
      return address;
    }

    // Wait for the handshake to resolve via onStatusChange.
    const myGeneration = ++generationRef.current;
    const outcome = await new Promise<ConnectOutcome>((resolve) => {
      const timeout = setTimeout(() => {
        if (generationRef.current === myGeneration) {
          resolve({ ok: false, error: new Error("TON Connect handshake timed out") });
        }
      }, 60_000);
      inflightRef.current = { resolve, timeout };
    });
    inflightRef.current = null;
    if (myGeneration !== generationRef.current) {
      // Stale promise from a prior connect() — discard.
      throw new Error("TON Connect connection was cancelled");
    }
    if (!outcome.ok) throw outcome.error;
    const addr = outcome.address;
    setTonAddress(addr);
    setChainFamily("ton");
    trackEvent("wallet_connect", { family: "ton" });
    return addr;
  }, [tcui, rawAddress, setTonAddress, setChainFamily]);

  // Subscribe to TON Connect status changes; resolve any in-flight connect().
  useEffect(() => {
    // Capture the generation at effect mount so the cleanup can compare
    // against the current generation when it runs — ESLint's exhaustive-deps
    // rule wants us to never read the ref inside cleanup, since React may
    // have already torn down other effects between then.
    const myGeneration = generationRef.current;
    const unsubscribe = tcui.onStatusChange(
      (wallet) => {
        if (generationRef.current !== myGeneration) return;
        const inflight = inflightRef.current;
        if (!inflight) return;
        const addr = wallet?.account?.address;
        if (addr) {
          clearTimeout(inflight.timeout);
          inflight.resolve({ ok: true, address: addr });
        } else if (wallet === null) {
          clearTimeout(inflight.timeout);
          inflight.resolve({
            ok: false,
            error: new Error("TON Connect connection was cancelled"),
          });
        }
      },
      (err: unknown) => {
        if (generationRef.current !== myGeneration) return;
        const inflight = inflightRef.current;
        if (!inflight) return;
        clearTimeout(inflight.timeout);
        const message =
          err instanceof Error ? err.message : "TON Connect handshake failed";
        inflight.resolve({ ok: false, error: new Error(message) });
      },
    );
    return () => {
      unsubscribe();
      // On unmount, cancel any in-flight connect from this generation.
      const inflight = inflightRef.current;
      if (inflight) {
        clearTimeout(inflight.timeout);
        inflight.resolve({
          ok: false,
          error: new Error("TON Connect connection was cancelled"),
        });
        inflightRef.current = null;
      }
      generationRef.current++;
    };
  }, [tcui]);

  const disconnect = useCallback(async () => {
    try {
      await tcui.connector.disconnect();
    } catch {
      // Wallet may already be disconnected — clear local state anyway.
    }
    setTonAddress(null);
    setChainFamily(null);
  }, [tcui, setTonAddress, setChainFamily]);

  const signMessage = useCallback(
    async (message: string): Promise<TonSignResult> => {
      const account = tcui.connector.account;
      if (!account) {
        throw new Error("Connect a TON wallet before signing");
      }
      const publicKey = account.publicKey;
      if (!publicKey) {
        throw new Error(
          "Connected TON wallet did not advertise an ed25519 publicKey — sign-in requires it",
        );
      }
      try {
        const response = await tcui.connector.signData({
          type: "text",
          text: message,
        });
        const { signature, address, timestamp, domain, payload } = response;
        return { signature, address, timestamp, domain, payload, publicKey };
      } catch (err) {
        // Surface a clearer message when the wallet disconnects mid-sign.
        const reason =
          err instanceof Error ? err.message : "TON signData failed";
        throw new Error(
          `TON wallet rejected the sign request: ${reason}. Reconnect the wallet and try again.`,
        );
      }
    },
    [tcui],
  );

  const address = useMemo(
    () => tonAddress ?? rawAddress ?? null,
    [tonAddress, rawAddress],
  );

  return {
    address,
    connect,
    disconnect,
    signMessage,
  };
};