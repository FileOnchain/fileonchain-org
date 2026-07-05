"use client";

import * as React from "react";
import Link from "next/link";
import { FiAlertCircle, FiArrowRight, FiCheck, FiUser } from "react-icons/fi";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Identicon } from "@/components/ui/Identicon";
import { SearchSelect } from "@/components/ui/SearchSelect";
import { useChain } from "@/hooks/useChain";
import { useVisibleChains } from "@/hooks/useVisibleChains";
import { CHAIN_FAMILY_LABELS, type ChainFamily } from "@fileonchain/sdk";
import { useSubstrateWallet } from "@/hooks/useSubstrateWallet";
import { useEVMWallet } from "@/hooks/useEVMWallet";
import { useSolanaWallet } from "@/hooks/useSolanaWallet";
import { useAptosWallet } from "@/hooks/useAptosWallet";
import { useCosmosWallet } from "@/hooks/useCosmosWallet";
import { useSuiWallet } from "@/hooks/useSuiWallet";
import { useStarknetWallet } from "@/hooks/useStarknetWallet";
import { useNearWallet } from "@/hooks/useNearWallet";
import { useTronWallet } from "@/hooks/useTronWallet";
import { useCardanoWallet } from "@/hooks/useCardanoWallet";
import { useTonWallet } from "@/hooks/useTonWallet";
import { useHederaWallet } from "@/hooks/useHederaWallet";
import { useWalletStates } from "@/states/wallet";
import WalletAccountPanel from "@/components/chain/WalletAccountPanel";
import { NetworkId, networks } from "@autonomys/auto-utils";
import { truncateFileName } from "@/utils/truncateFileName";

const ADDRESS_MAX = 16;

/** Connect copy per family — every family except Substrate shares the
 * injected-wallet flow below, so a chain addition is one map entry. */
const INJECTED_WALLET_COPY: Partial<
  Record<ChainFamily, { blurb: string; cta: string }>
> = {
  evm: {
    blurb:
      "Connect an EVM wallet (MetaMask, Rabby, Coinbase). Uses injected window.ethereum.",
    cta: "Connect EVM wallet",
  },
  solana: {
    blurb: "Connect Phantom or Solflare. Uses the global window.solana provider.",
    cta: "Connect Phantom / Solflare",
  },
  aptos: {
    blurb: "Connect Petra or Martian. Uses the global window.aptos provider.",
    cta: "Connect Petra / Martian",
  },
  cosmos: {
    blurb: "Connect Keplr or Leap. Anchors ride the transaction memo.",
    cta: "Connect Keplr / Leap",
  },
  sui: {
    blurb: "Connect a wallet-standard Sui wallet like Slush.",
    cta: "Connect Sui wallet",
  },
  starknet: {
    blurb: "Connect Argent or Braavos. Uses the injected window.starknet provider.",
    cta: "Connect Argent / Braavos",
  },
  near: {
    blurb: "Connect Sender or Meteor. Uses the injected window.near provider.",
    cta: "Connect NEAR wallet",
  },
  tron: {
    blurb: "Connect TronLink. Uses the injected window.tronWeb provider.",
    cta: "Connect TronLink",
  },
  cardano: {
    blurb: "Connect a CIP-30 wallet like Lace or Eternl.",
    cta: "Connect Cardano wallet",
  },
  ton: {
    blurb: "Connect OpenMask or MyTonWallet. Anchors ride transfer comments.",
    cta: "Connect TON wallet",
  },
  hedera: {
    blurb:
      "Hedera wallets pair via HashConnect, which is coming soon — anchor on Hedera with credits or the API meanwhile.",
    cta: "Connect HashPack (soon)",
  },
};

interface ChainConnectModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * ChainConnectModal — unified wallet connect modal. Substrate keeps its
 * network/account picker; every other family renders the shared
 * injected-wallet flow with per-family copy.
 *
 * Each family's hook is lazy-loaded; calls that depend on `window.<provider>`
 * are guarded so the modal renders during SSR without crashing.
 */
export const ChainConnectModal = ({ open, onOpenChange }: ChainConnectModalProps) => {
  const { activeChain, setActiveChainId } = useChain();
  const visibleChains = useVisibleChains();
  const chainFamily = activeChain.family;

  // Substrate state
  const { connectWallet: connectSubstrate } = useSubstrateWallet();
  const substrateAccounts = useWalletStates((s) => s.accounts);
  const selectedAccount = useWalletStates((s) => s.selectedAccount);
  const setSelectedAccount = useWalletStates((s) => s.setSelectedAccount);
  const networkId = useWalletStates((s) => s.networkId);
  const setNetworkId = useWalletStates((s) => s.setNetworkId);
  const [substrateError, setSubstrateError] = React.useState<string | null>(null);

  const evm = useEVMWallet();
  const solana = useSolanaWallet();
  const aptos = useAptosWallet();
  const cosmos = useCosmosWallet();
  const sui = useSuiWallet();
  const starknet = useStarknetWallet();
  const near = useNearWallet();
  const tron = useTronWallet();
  const cardano = useCardanoWallet();
  const ton = useTonWallet();
  const hedera = useHederaWallet();
  const [walletError, setWalletError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  /** Uniform {address, connect} handle per injected-wallet family. */
  const familyWallets: Partial<
    Record<ChainFamily, { address: string | null; connect: () => Promise<string> }>
  > = {
    evm,
    solana,
    aptos,
    cosmos: { address: cosmos.address, connect: () => cosmos.connect() },
    sui,
    starknet,
    near,
    tron,
    cardano,
    ton,
    hedera: { address: hedera.address, connect: hedera.connect },
  };

  const addressFor = (family: ChainFamily | null): string | null =>
    family === null
      ? null
      : family === "substrate"
        ? selectedAccount?.address ?? null
        : familyWallets[family]?.address ?? null;

  // Family of the wallet actually connected — distinct from `chainFamily`,
  // which tracks the chain selected in the switcher above.
  const connectedFamily = useWalletStates((s) => s.chainFamily);
  const connectedAddress = addressFor(connectedFamily);

  const close = () => onOpenChange(false);

  // Address of the wallet connected for the family shown on the current tab
  // — drives the account panel (sign in with / verify ownership of it).
  const tabAddress = addressFor(chainFamily);

  // Runtimes with at least one visible chain, in registry label order.
  const runtimes = (Object.keys(CHAIN_FAMILY_LABELS) as ChainFamily[]).filter(
    (family) => visibleChains.some((chain) => chain.family === family),
  );

  // Connect handlers keep the modal open: the next step — signing in with
  // the wallet or verifying ownership — renders right below.
  const handleSubstrateConnect = async () => {
    if (!selectedAccount) return;
    setSubstrateError(null);
    try {
      await connectSubstrate(selectedAccount);
    } catch (e) {
      setSubstrateError((e as Error).message);
    }
  };

  const handleInjectedConnect = async (family: ChainFamily) => {
    const wallet = familyWallets[family];
    if (!wallet) return;
    setWalletError(null);
    setBusy(true);
    try {
      await wallet.connect();
    } catch (e) {
      setWalletError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const injectedCopy =
    chainFamily === "substrate" ? null : INJECTED_WALLET_COPY[chainFamily];

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
        {runtimes.map((runtime) => {
          const firstOfRuntime = visibleChains.find((c) => c.family === runtime);
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

      {chainFamily === "substrate" ? (
        <div className="space-y-3">
          <p className="text-sm text-muted">
            Approve the FileOnChain app in your polkadot.js / Talisman / SubWallet extension, then pick a network and account.
          </p>
          <label className="block" htmlFor="substrate-network">
            <span className="text-sm font-medium text-foreground">Network</span>
            <div className="mt-1">
              <SearchSelect
                id="substrate-network"
                ariaLabel="Substrate network"
                options={networks.map((network) => ({
                  value: network.id,
                  label: network.name,
                }))}
                value={networkId}
                onValueChange={(id) => setNetworkId(id as NetworkId)}
                searchPlaceholder="Search networks…"
              />
            </div>
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
      ) : (
        injectedCopy && (
          <div className="space-y-3">
            <p className="text-sm text-muted">{injectedCopy.blurb}</p>
            {tabAddress ? (
              <div className="flex items-center justify-between rounded-md border border-border bg-surface p-3">
                <div className="flex items-center gap-2 min-w-0">
                  <Identicon value={tabAddress} size={28} />
                  <code className="font-mono text-sm truncate">
                    {truncateFileName(tabAddress, ADDRESS_MAX)}
                  </code>
                </div>
                <Badge variant="success" size="sm" icon={<FiCheck />}>
                  Connected
                </Badge>
              </div>
            ) : (
              <Button
                fullWidth
                onClick={() => handleInjectedConnect(chainFamily)}
                isLoading={busy}
              >
                {injectedCopy.cta}
              </Button>
            )}
            {walletError && (
              <p role="alert" className="text-sm text-danger inline-flex items-center gap-1.5">
                <FiAlertCircle /> {walletError}
              </p>
            )}
          </div>
        )
      )}

      {/* Account step — connecting and the account are one flow: sign in
          with this wallet, or verify ownership onto the signed-in account. */}
      <WalletAccountPanel
        family={chainFamily}
        address={tabAddress}
        onSignedIn={close}
      />

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
