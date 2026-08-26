"use client";

import * as React from "react";
import { FiAlertCircle, FiCheck } from "react-icons/fi";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Identicon } from "@/components/ui/Identicon";
import { SearchSelect } from "@/components/ui/SearchSelect";
import { CHAIN_FAMILY_LABELS, type ChainFamily } from "@fileonchain/sdk";
import { WALLET_FAMILIES } from "@/lib/auth/wallet-message";
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
import { getFamilyAddress, useWalletStates } from "@/states/wallet";
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
      "Pair HashPack via WalletConnect in the AppKit modal. Browser-side anchoring is a follow-up — anchor on Hedera with credits or the API in the meantime.",
    cta: "Connect HashPack",
  },
};

interface SubstrateConnectBodyProps {
  /** Called once the extension account is connected. */
  onConnected?: () => void;
}

/**
 * Substrate connect step — its own component so useSubstrateWallet's
 * mount-time effects (web3Enable authorization pop-up + RPC activate) only
 * run once the Substrate tab is actually selected.
 */
const SubstrateConnectBody = ({ onConnected }: SubstrateConnectBodyProps) => {
  const { connectWallet: connectSubstrate } = useSubstrateWallet();
  const substrateAccounts = useWalletStates((s) => s.accounts);
  const selectedAccount = useWalletStates((s) => s.selectedAccount);
  const setSelectedAccount = useWalletStates((s) => s.setSelectedAccount);
  const networkId = useWalletStates((s) => s.networkId);
  const setNetworkId = useWalletStates((s) => s.setNetworkId);
  const [error, setError] = React.useState<string | null>(null);

  const handleConnect = async () => {
    if (!selectedAccount) return;
    setError(null);
    try {
      await connectSubstrate(selectedAccount);
      onConnected?.();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
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
      <Button fullWidth onClick={handleConnect} disabled={!selectedAccount}>
        Connect Substrate
      </Button>
      {error && (
        <p role="alert" className="text-sm text-danger inline-flex items-center gap-1.5">
          <FiAlertCircle /> {error}
        </p>
      )}
    </div>
  );
};

interface WalletConnectPanelProps {
  /** Family tab selected on mount (defaults to EVM). */
  initialFamily?: ChainFamily;
  /** Called after a wallet of `family` connects successfully. */
  onConnected?: (family: ChainFamily) => void;
  /** Called after a successful wallet sign-in (caller owns navigation). */
  onSignedIn?: () => void;
}

/**
 * WalletConnectPanel — THE wallet surface, shared by the connect modal and
 * the /login page so connecting and signing in are one flow. Every
 * auth-capable family (WALLET_FAMILIES) gets a tab; Substrate keeps its
 * network/account picker, every other family renders the shared
 * injected-wallet flow with per-family copy. Connecting reveals the account
 * step (sign in with the wallet, or verify ownership onto the session).
 *
 * The selected family is local state — switching tabs never mutates the
 * global active anchoring chain; callers that want to follow the connected
 * wallet do it via `onConnected`.
 */
export const WalletConnectPanel = ({
  initialFamily,
  onConnected,
  onSignedIn,
}: WalletConnectPanelProps) => {
  const [selectedFamily, setSelectedFamily] = React.useState<ChainFamily>(
    initialFamily ?? "evm",
  );

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

  /** Uniform connect entrypoint per injected-wallet family. */
  const familyConnect: Partial<Record<ChainFamily, () => Promise<string>>> = {
    evm: () => evm.connect(),
    solana: () => solana.connect(),
    aptos: () => aptos.connect(),
    cosmos: () => cosmos.connect(),
    sui: () => sui.connect(),
    starknet: () => starknet.connect(),
    near: () => near.connect(),
    tron: () => tron.connect(),
    cardano: () => cardano.connect(),
    ton: () => ton.connect(),
    hedera: () => hedera.connect(),
  };

  // Address of the wallet connected for the family shown on the current tab
  // — drives the account panel (sign in with / verify ownership of it).
  const tabAddress = useWalletStates((s) => getFamilyAddress(s, selectedFamily));

  const handleInjectedConnect = async (family: ChainFamily) => {
    const connect = familyConnect[family];
    if (!connect) return;
    setWalletError(null);
    setBusy(true);
    try {
      await connect();
      onConnected?.(family);
    } catch (e) {
      setWalletError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const injectedCopy =
    selectedFamily === "substrate" ? null : INJECTED_WALLET_COPY[selectedFamily];

  return (
    <div>
      {/* Family tabs — every auth-capable runtime, connect + sign-in alike. */}
      <div className="mb-4 flex flex-wrap gap-2">
        {WALLET_FAMILIES.map((family) => (
          <button
            key={family}
            type="button"
            onClick={() => {
              setSelectedFamily(family);
              setWalletError(null);
            }}
            aria-pressed={selectedFamily === family}
            className={`rounded-md px-3 py-1.5 text-xs font-medium border transition-colors ${
              selectedFamily === family
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-surface text-muted border-border hover:text-foreground"
            }`}
          >
            {CHAIN_FAMILY_LABELS[family]}
          </button>
        ))}
      </div>

      {selectedFamily === "substrate" ? (
        <SubstrateConnectBody onConnected={() => onConnected?.("substrate")} />
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
                onClick={() => handleInjectedConnect(selectedFamily)}
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
        family={selectedFamily}
        address={tabAddress}
        onSignedIn={onSignedIn}
      />
    </div>
  );
};

export default WalletConnectPanel;
