import type { ChunkedAnchorReceipt } from "@fileonchain/sdk";
import { useWalletStates } from "@/states/wallet";
import type { AnchorRequest } from "./types";

/**
 * Aptos sender — free `file_registry::anchor_cid` calls per chunk, then the
 * file-level anchor last, through Petra / Martian. Provisioning is checked
 * before any wallet interaction, so until a module address lands in the SDK
 * chain registry this throws ChainNotProvisionedError and the uploader
 * falls back to the simulated flow.
 */
export const sendAptosAnchor = async ({
  chain,
  fileCid,
  chunks,
  platformId,
  includeData,
  uri,
  onProgress,
}: AnchorRequest): Promise<ChunkedAnchorReceipt> => {
  const { anchorChunkedFile, resolveAptosChain } = await import(
    "@fileonchain/sdk/aptos"
  );
  resolveAptosChain(chain.id); // throws ChainNotProvisionedError pre-wallet

  const { aptosAddress } = useWalletStates.getState();
  const provider =
    typeof window === "undefined"
      ? null
      : (window.petra ?? window.aptos ?? window.martian ?? null);
  if (!aptosAddress || !provider) {
    throw new Error("Connect an Aptos wallet before anchoring");
  }
  const signAndSubmitTransaction = provider.signAndSubmitTransaction?.bind(provider);
  if (!signAndSubmitTransaction) {
    throw new Error("The connected Aptos wallet cannot submit transactions");
  }

  return anchorChunkedFile(
    { address: aptosAddress, signAndSubmitTransaction },
    { chainId: chain.id, fileCid, chunks, platformId, includeData, uri, onProgress },
  );
};
