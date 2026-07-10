import type { PublicClient, WalletClient } from "viem";
import type { ChainConfig } from "@fileonchain/sdk";
import { useWalletStates } from "@/states/wallet";

/**
 * Chain-aware EVM client helpers shared by the wallet-interactive flows
 * (cache payments, donations, staking). Mirrors the pattern in
 * lib/anchor/evm.ts: viem is dynamic-imported so it stays out of the client
 * bundle until a flow actually needs it, the wallet handle comes from
 * useWalletStates, and the injected wallet is moved onto the target chain
 * before any write (registering it on 4902).
 */

export interface ConnectedEvmWallet {
  walletClient: WalletClient;
  address: `0x${string}`;
}

/** Injected-wallet client on `chain`, switched/registered as needed. */
export const getEvmWalletClient = async (
  chain: ChainConfig,
): Promise<ConnectedEvmWallet> => {
  const [{ createWalletClient, custom }, { toViemChain }] = await Promise.all([
    import("viem"),
    import("@fileonchain/sdk/evm"),
  ]);

  const { evmAddress } = useWalletStates.getState();
  const provider = typeof window === "undefined" ? undefined : window.ethereum;
  if (!evmAddress || !provider) {
    throw new Error("Connect an EVM wallet first.");
  }

  const viemChain = toViemChain(chain);
  const walletClient = createWalletClient({
    account: evmAddress,
    chain: viemChain,
    transport: custom(provider),
  });

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

  return { walletClient, address: evmAddress };
};

/** Read-only client on `chain`'s RPC. */
export const getEvmPublicClient = async (
  chain: ChainConfig,
): Promise<PublicClient> => {
  const [{ createPublicClient, http }, { toViemChain }] = await Promise.all([
    import("viem"),
    import("@fileonchain/sdk/evm"),
  ]);
  return createPublicClient({
    chain: toViemChain(chain),
    transport: http(chain.rpcUrl),
  }) as PublicClient;
};
