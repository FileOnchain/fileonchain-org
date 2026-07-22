import type { ChunkedAnchorReceipt } from "@fileonchain/sdk";
import type { AnchorRequest } from "./types";

/**
 * Hedera sender — honest seam, not a sender yet. Wallet pairing for sign-in
 * ships via Reown AppKit + HederaAdapter (see `useHederaWallet` +
 * `HederaAppKitProvider`), but the browser-side anchor sender is a follow-up.
 * For now this throws so the uploader can fall back to the credits / API
 * path — the server-side anchor worker still submits HCS messages with the
 * operator signer. The chain is resolved first so an unprovisioned chain
 * (no `hcsTopicId`) surfaces `ChainNotProvisionedError` and the uploader
 * falls back to its simulated flow, exactly like the other families.
 */
export const sendHederaAnchor = async ({
  chain,
}: AnchorRequest): Promise<ChunkedAnchorReceipt> => {
  const { resolveHederaChain } = await import("@fileonchain/sdk/hedera");
  resolveHederaChain(chain.id);

  throw new Error(
    "Browser-side Hedera anchoring is a follow-up — wallet pairing for sign-in ships via Reown AppKit + HederaAdapter, but the client anchor sender still rides credits or the API. Anchor on Hedera via the API for now.",
  );
};
