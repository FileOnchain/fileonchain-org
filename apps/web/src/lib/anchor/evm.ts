import { createWalletClient, custom } from "viem";
import type { ChunkedAnchorReceipt } from "@fileonchain/sdk";
import { useWalletStates } from "@/states/wallet";
import type { AnchorRequest } from "./types";

/**
 * EVM sender — sequential `FileRegistry.anchorCID` transactions through the
 * injected wallet. Provisioning is checked before any wallet interaction so
 * unprovisioned chains fall back to the simulated flow without a pop-up.
 */
export const sendEvmAnchor = async ({
  chain,
  fileCid,
  chunks,
  onProgress,
}: AnchorRequest): Promise<ChunkedAnchorReceipt> => {
  const { anchorChunkedFile, resolveEvmChain, toViemChain } = await import(
    "@fileonchain/sdk/evm"
  );
  resolveEvmChain(chain.id); // throws ChainNotProvisionedError pre-wallet

  const { evmAddress } = useWalletStates.getState();
  const provider = typeof window === "undefined" ? undefined : window.ethereum;
  if (!evmAddress || !provider) {
    throw new Error("Connect an EVM wallet before anchoring");
  }

  const viemChain = toViemChain(chain);
  const walletClient = createWalletClient({
    account: evmAddress,
    chain: viemChain,
    transport: custom(provider),
  });

  // Move the wallet onto the target chain; 4902 means it's unknown to the
  // wallet, so register it first. Other failures fall through — the write
  // itself will surface a precise error if the chain is still wrong.
  try {
    await walletClient.switchChain({ id: viemChain.id });
  } catch (error) {
    const code =
      (error as { code?: number; cause?: { code?: number } }).cause?.code ??
      (error as { code?: number }).code;
    if (code === 4902) {
      await walletClient.addChain({ chain: viemChain });
      await walletClient.switchChain({ id: viemChain.id });
    }
  }

  return anchorChunkedFile(walletClient, {
    chainId: chain.id,
    fileCid,
    chunks,
    onProgress,
  });
};
