"use client";

import * as React from "react";
import Link from "next/link";
import { FiAlertCircle, FiArrowRight, FiCheck, FiUser } from "react-icons/fi";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Identicon } from "@/components/ui/Identicon";
import { useChain } from "@/hooks/useChain";
import { CHAINS, CHAIN_FAMILY_LABELS } from "@fileonchain/sdk";
import { useSubstrateWallet } from "@/hooks/useSubstrateWallet";
import { useEVMWallet } from "@/hooks/useEVMWallet";
import { useSolanaWallet } from "@/hooks/useSolanaWallet";
import { useAptosWallet } from "@/hooks/useAptosWallet";
import { useWalletStates } from "@/states/wallet";
import { NetworkId, networks } from "@autonomys/auto-utils";
import { truncateFileName } from "@/utils/truncateFileName";

const ADDRESS_MAX = 16;

interface ChainConnectModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * ChainConnectModal — unified wallet connect modal. Renders a different
 * control surface per chain family but keeps the UX consistent.
 *
 * Each family's hook is lazy-loaded; calls that depend on `window.<provider>`
 * are guarded so the modal renders during SSR without crashing.
 */
export const ChainConnectModal = ({ open, onOpenChange }: ChainConnectModalProps) => {
  const { activeChain, setActiveChainId } = useChain();
  const chainFamily = activeChain.family;

  // Substrate state
  const { connectWallet: connectSubstrate } = useSubstrateWallet();
  const substrateAccounts = useWalletStates((s) => s.accounts);
  const selectedAccount = useWalletStates((s) => s.selectedAccount);
  const setSelectedAccount = useWalletStates((s) => s.setSelectedAccount);
  const networkId = useWalletStates((s) => s.networkId);
  const setNetworkId = useWalletStates((s) => s.setNetworkId);
  const [substrateError, setSubstrateError] = React.useState<string | null>(null);

  // EVM / Solana / Aptos
  const evm = useEVMWallet();
  const solana = useSolanaWallet();
  const aptos = useAptosWallet();
  const [walletError, setWalletError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  // Family of the wallet actually connected — distinct from `chainFamily`,
  // which tracks the chain selected in the switcher above.
  const connectedFamily = useWalletStates((s) => s.chainFamily);
  const connectedAddress =
    connectedFamily === "evm"
      ? evm.address
      : connectedFamily === "solana"
        ? solana.address
        : connectedFamily === "aptos"
          ? aptos.address
          : connectedFamily === "substrate"
            ? selectedAccount?.address ?? null
            : null;

  const close = () => onOpenChange(false);

  const handleSubstrateConnect = async () => {
    if (!selectedAccount) return;
    setSubstrateError(null);
    try {
      await connectSubstrate(selectedAccount);
      close();
    } catch (e) {
      setSubstrateError((e as Error).message);
    }
  };

  const handleEvmConnect = async () => {
    setWalletError(null);
    setBusy(true);
    try {
      await evm.connect();
      close();
    } catch (e) {
      setWalletError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleSolanaConnect = async () => {
    setWalletError(null);
    setBusy(true);
    try {
      await solana.connect();
      close();
    } catch (e) {
      setWalletError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleAptosConnect = async () => {
    setWalletError(null);
    setBusy(true);
    try {
      await aptos.connect();
      close();
    } catch (e) {
      setWalletError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Connect wallet"
      description={`Connect a ${CHAIN_FAMILY_LABELS[activeChain.family]} wallet to anchor CIDs onchain.`}
      size="md"
    >
      {/* Runtime switcher — clicking a runtime jumps to the first chain
          within it so the modal body swaps to the matching connect flow. */}
      <div className="mb-4 flex flex-wrap gap-2">
        {(["evm", "substrate", "solana", "aptos"] as const).map((runtime) => {
          const firstOfRuntime = CHAINS.find((c) => c.family === runtime);
          return (
            <button
              key={runtime}
              type="button"
              onClick={() =>
                firstOfRuntime && setActiveChainId(firstOfRuntime.id)
              }
              aria-pressed={chainFamily === runtime}
              className={`rounded-md px-3 py-1.5 text-xs font-medium border transition-colors ${
                chainFamily === runtime
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-surface text-muted border-border hover:text-foreground"
              }`}
            >
              {CHAIN_FAMILY_LABELS[runtime]}
            </button>
          );
        })}
      </div>

      {chainFamily === "evm" && (
        <div className="space-y-3">
          <p className="text-sm text-muted">
            Connect an EVM wallet (MetaMask, Rabby, Coinbase). Uses injected window.ethereum.
          </p>
          {evm.address ? (
            <div className="flex items-center justify-between rounded-md border border-border bg-surface p-3">
              <div className="flex items-center gap-2 min-w-0">
                <Identicon value={evm.address} size={28} />
                <code className="font-mono text-sm truncate">
                  {truncateFileName(evm.address, ADDRESS_MAX)}
                </code>
              </div>
              <Badge variant="success" size="sm" icon={<FiCheck />}>
                Connected
              </Badge>
            </div>
          ) : (
            <Button fullWidth onClick={handleEvmConnect} isLoading={busy}>
              Connect EVM wallet
            </Button>
          )}
          {walletError && (
            <p role="alert" className="text-sm text-danger inline-flex items-center gap-1.5">
              <FiAlertCircle /> {walletError}
            </p>
          )}
        </div>
      )}

      {chainFamily === "substrate" && (
        <div className="space-y-3">
          <p className="text-sm text-muted">
            Approve the FileOnChain app in your polkadot.js / Talisman / SubWallet extension, then pick a network and account.
          </p>
          <label className="block">
            <span className="text-sm font-medium text-foreground">Network</span>
            <select
              value={networkId}
              onChange={(e) => {
                const network = networks.find((net) => net.name === e.target.value);
                setNetworkId((network?.id as NetworkId) ?? networkId);
              }}
              className="mt-1 w-full p-2 rounded-md bg-surface text-foreground border border-border focus:outline-none focus:ring-2 focus:ring-primary text-sm"
            >
              {networks.map((network) => (
                <option key={network.name} value={network.name}>
                  {network.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-sm font-medium text-foreground">Account</span>
            <select
              value={selectedAccount?.address ?? ""}
              onChange={(e) => {
                const account = substrateAccounts.find((acc) => acc.address === e.target.value);
                setSelectedAccount(account ?? null);
              }}
              className="mt-1 w-full p-2 rounded-md bg-surface text-foreground border border-border focus:outline-none focus:ring-2 focus:ring-primary text-sm"
            >
              <option value="" disabled>
                Select an account
              </option>
              {substrateAccounts.map((account) => (
                <option key={account.address} value={account.address}>
                  {account.meta.name || truncateFileName(account.address, ADDRESS_MAX)}
                </option>
              ))}
            </select>
          </label>
          <Button fullWidth onClick={handleSubstrateConnect} disabled={!selectedAccount}>
            Connect Substrate
          </Button>
          {substrateError && (
            <p role="alert" className="text-sm text-danger inline-flex items-center gap-1.5">
              <FiAlertCircle /> {substrateError}
            </p>
          )}
        </div>
      )}

      {chainFamily === "solana" && (
        <div className="space-y-3">
          <p className="text-sm text-muted">
            Connect Phantom or Solflare. Uses the global window.solana provider.
          </p>
          {solana.address ? (
            <div className="flex items-center justify-between rounded-md border border-border bg-surface p-3">
              <div className="flex items-center gap-2 min-w-0">
                <Identicon value={solana.address} size={28} />
                <code className="font-mono text-sm truncate">
                  {truncateFileName(solana.address, ADDRESS_MAX)}
                </code>
              </div>
              <Badge variant="success" size="sm" icon={<FiCheck />}>
                Connected
              </Badge>
            </div>
          ) : (
            <Button fullWidth onClick={handleSolanaConnect} isLoading={busy}>
              Connect Phantom / Solflare
            </Button>
          )}
          {walletError && (
            <p role="alert" className="text-sm text-danger inline-flex items-center gap-1.5">
              <FiAlertCircle /> {walletError}
            </p>
          )}
        </div>
      )}

      {chainFamily === "aptos" && (
        <div className="space-y-3">
          <p className="text-sm text-muted">
            Connect Petra or Martian. Uses the global window.aptos provider.
          </p>
          {aptos.address ? (
            <div className="flex items-center justify-between rounded-md border border-border bg-surface p-3">
              <div className="flex items-center gap-2 min-w-0">
                <Identicon value={aptos.address} size={28} />
                <code className="font-mono text-sm truncate">
                  {truncateFileName(aptos.address, ADDRESS_MAX)}
                </code>
              </div>
              <Badge variant="success" size="sm" icon={<FiCheck />}>
                Connected
              </Badge>
            </div>
          ) : (
            <Button fullWidth onClick={handleAptosConnect} isLoading={busy}>
              Connect Petra / Martian
            </Button>
          )}
          {walletError && (
            <p role="alert" className="text-sm text-danger inline-flex items-center gap-1.5">
              <FiAlertCircle /> {walletError}
            </p>
          )}
        </div>
      )}

      {chainFamily !== "substrate" && (
        <p className="mt-4 text-[11px] text-muted">
          {/* TODO: real RPC + signing — current implementation only stores the address. */}
        </p>
      )}

      {/* Public profile shortcut — appears once any wallet is connected. */}
      {connectedAddress && (
        <div className="mt-5 border-t border-border pt-4">
          <Link
            href={`/profile/${encodeURIComponent(connectedAddress)}`}
            onClick={close}
            className="group flex items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2.5 transition-colors duration-base ease-out-soft hover:border-primary/40 hover:bg-surface-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-surface-elevated text-primary">
              <FiUser size={14} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-foreground">
                View public profile
              </span>
              <span className="block truncate font-mono text-[11px] text-muted">
                {truncateFileName(connectedAddress, ADDRESS_MAX)} · anchors, rank &amp; linked wallets
              </span>
            </span>
            <FiArrowRight
              size={14}
              className="shrink-0 text-muted transition-transform duration-base group-hover:translate-x-0.5 group-hover:text-primary"
            />
          </Link>
        </div>
      )}
    </Modal>
  );
};

export default ChainConnectModal;