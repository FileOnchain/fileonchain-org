"use client";

import { NetworkId, networks } from "@autonomys/auto-utils";
import { useEffect } from "react";
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
    <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-surface text-foreground p-6 rounded-md w-96 border border-border">
        <h2 className="text-xl mb-4">Connect Wallet</h2>
        <select
          value={networkId}
          onChange={(e) => {
            const network = networks.find((net) => net.name === e.target.value);
            setNetworkId(network?.id as NetworkId);
          }}
          className="w-full p-2 mb-4 border rounded bg-background text-foreground border-border"
        >
          {networks.map((network) => (
            <option key={network.name} value={network.name}>
              {network.name}
            </option>
          ))}
        </select>
        <select
          value={selectedAccount?.address || ""}
          onChange={(e) => {
            const account = accounts.find(
              (acc) => acc.address === e.target.value
            );
            setSelectedAccount(account || null);
          }}
          className="w-full p-2 mb-4 border rounded bg-background text-foreground border-border"
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
        <button
          onClick={handleConnect}
          className="w-full bg-primary text-white p-2 rounded hover:bg-primary-hover transition-colors"
        >
          Connect
        </button>
        <button
          onClick={onClose}
          className="w-full bg-muted text-white p-2 rounded mt-2 hover:opacity-90 transition-opacity"
        >
          Cancel
        </button>
      </div>
    </div>
  );
};

export default ConnectWalletModal;