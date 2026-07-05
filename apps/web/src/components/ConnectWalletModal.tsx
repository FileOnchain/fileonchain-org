"use client";

import { NetworkId, networks } from "@autonomys/auto-utils";
import { useEffect } from "react";
import { SearchSelect } from "@/components/ui/SearchSelect";
import { useWallet } from "@/hooks/useWallet";
import { useWalletStates } from "@/states/wallet";

interface ConnectWalletModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const ConnectWalletModal = ({ isOpen, onClose }: ConnectWalletModalProps) => {
  const { connectWallet } = useWallet();

  const accounts = useWalletStates((state) => state.accounts);
  const selectedAccount = useWalletStates((state) => state.selectedAccount);
  const networkId = useWalletStates((state) => state.networkId);
  const setNetworkId = useWalletStates((state) => state.setNetworkId);
  const setSelectedAccount = useWalletStates(
    (state) => state.setSelectedAccount
  );

  const handleConnect = async () => {
    if (!selectedAccount) return;
    await connectWallet(selectedAccount);
    onClose();
  };

  useEffect(() => {
    if (!isOpen || !selectedAccount) return;
    void connectWallet(selectedAccount);
  }, [isOpen, selectedAccount, connectWallet]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="connect-wallet-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
    >
      <div className="bg-surface-elevated text-foreground p-6 rounded-xl w-full max-w-md border border-border shadow-elev-3">
        <h2 id="connect-wallet-title" className="text-xl font-semibold mb-4">
          Connect Wallet
        </h2>
        <label className="block mb-3" htmlFor="connect-network">
          <span className="text-sm font-medium text-foreground">Network</span>
          <div className="mt-1">
            <SearchSelect
              id="connect-network"
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
        <label className="block mb-4">
          <span className="text-sm font-medium text-foreground">Account</span>
          <select
            value={selectedAccount?.address || ""}
            onChange={(e) => {
              const account = accounts.find(
                (acc) => acc.address === e.target.value
              );
              setSelectedAccount(account || null);
            }}
            className="mt-1 w-full p-2 rounded-md bg-surface text-foreground border border-border focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="" disabled>
              Select an account
            </option>
            {accounts.map((account) => (
              <option key={account.address} value={account.address}>
                {account.meta.name || account.address}
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            onClick={onClose}
            className="inline-flex items-center justify-center h-10 px-4 rounded-md text-sm font-medium bg-surface text-foreground border border-border hover:bg-surface-elevated transition-colors duration-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            Cancel
          </button>
          <button
            onClick={handleConnect}
            className="inline-flex items-center justify-center h-10 px-4 rounded-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary-hover transition-colors duration-base ease-out-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            Connect
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConnectWalletModal;