import type { ChunkedAnchorReceipt } from "@fileonchain/sdk";
import type { AnchorRequest } from "./types";

/* TODO: wire to HashConnect v3 — pairing flow + hedera_signAndExecuteTransaction */

/**
 * Hedera sender — honest seam, not a sender yet. Browser pairing (HashPack
 * via HashConnect) isn't shipped, so this throws before any wallet work. The
 * chain is still resolved first so an unprovisioned chain (no `hcsTopicId`)
 * surfaces `ChainNotProvisionedError` and the uploader falls back to its
 * simulated flow, exactly like the other families. Server-side anchoring via
 * credits or the API works today — the anchor worker submits HCS messages
 * with the operator signer.
 */
export const sendHederaAnchor = async ({
  chain,
}: AnchorRequest): Promise<ChunkedAnchorReceipt> => {
  const { resolveHederaChain } = await import("@fileonchain/sdk/hedera");
  resolveHederaChain(chain.id);

  throw new Error(
    "Hedera wallets pair via HashConnect, which FileOnChain doesn't ship yet — anchor on Hedera with credits or the API instead.",
  );
};
