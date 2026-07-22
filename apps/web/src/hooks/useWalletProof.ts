"use client";

import { useCallback } from "react";
import type { ChainFamily } from "@fileonchain/sdk";
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
import {
  buildStarknetTypedData,
  buildWalletMessage,
  NEAR_SIGN_RECIPIENT,
} from "@/lib/auth/wallet-message";
import type { Account } from "@/types/types";

export interface WalletProof {
  family: ChainFamily;
  address: string;
  signature: string;
  nonce: string;
  publicKey?: string;
  fullMessage?: string;
  /** TON Connect binds a `timestamp` + `domain` into the signed digest. */
  timestamp?: number;
  domain?: string;
}

const requestNonce = async (
  family: ChainFamily,
  address: string,
): Promise<{ nonce: string; issuedAt: string }> => {
  const res = await fetch("/api/auth/wallet/nonce", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ family, address }),
  });
  if (!res.ok) throw new Error("Could not issue a signing nonce");
  return res.json();
};

/**
 * Collects a nonce-bound sign-message proof from a wallet of the given
 * family — the shared client half of wallet sign-in (Credentials provider)
 * and wallet linking (POST /api/wallets/link).
 *
 * Substrate talks to @polkadot/extension-dapp lazily on invocation (not via
 * useWallet) so rendering a component with this hook never triggers the
 * extension authorization pop-up.
 */
export const useWalletProof = () => {
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
  const substrateAccount = useWalletStates((s) => s.selectedAccount);
  const setSelectedAccount = useWalletStates((s) => s.setSelectedAccount);
  const setAccounts = useWalletStates((s) => s.setAccounts);
  const setChainFamily = useWalletStates((s) => s.setChainFamily);

  const collectProof = useCallback(
    async (family: ChainFamily): Promise<WalletProof> => {
      switch (family) {
        case "evm": {
          const address = evm.address ?? (await evm.connect());
          const { nonce, issuedAt } = await requestNonce(family, address);
          const message = buildWalletMessage({ family, address, nonce, issuedAt });
          const signature = await evm.signMessage(message, address);
          return { family, address, signature, nonce };
        }
        case "solana": {
          const address = solana.address ?? (await solana.connect());
          const { nonce, issuedAt } = await requestNonce(family, address);
          const message = buildWalletMessage({ family, address, nonce, issuedAt });
          const signature = await solana.signMessage(message);
          return { family, address, signature, nonce };
        }
        case "aptos": {
          const address = aptos.address ?? (await aptos.connect());
          const { nonce, issuedAt } = await requestNonce(family, address);
          const message = buildWalletMessage({ family, address, nonce, issuedAt });
          const { signature, fullMessage, publicKey } = await aptos.signMessage(
            message,
            nonce,
          );
          return { family, address, signature, nonce, publicKey, fullMessage };
        }
        case "substrate": {
          const { web3Enable, web3Accounts, web3FromSource } = await import(
            "@polkadot/extension-dapp"
          );
          const { stringToHex } = await import("@polkadot/util");
          const extensions = await web3Enable("FileOnChain");
          if (extensions.length === 0) {
            throw new Error(
              "No Substrate extension detected. Install SubWallet or polkadot.js.",
            );
          }
          const accounts = await web3Accounts();
          const account =
            (substrateAccount &&
              accounts.find((a) => a.address === substrateAccount.address)) ??
            accounts[0];
          if (!account) throw new Error("No Substrate account available");
          // Signing implies connection — reflect it in the wallet store so
          // the session and the connected-wallet UI stay in step.
          setAccounts(accounts as Account[]);
          setSelectedAccount(account as Account);
          setChainFamily("substrate");
          const address = account.address;
          const { nonce, issuedAt } = await requestNonce(family, address);
          const message = buildWalletMessage({ family, address, nonce, issuedAt });
          const injector = await web3FromSource(account.meta.source);
          const signRaw = injector.signer?.signRaw;
          if (!signRaw) {
            throw new Error(
              "The selected extension does not support raw signing",
            );
          }
          const { signature } = await signRaw({
            address,
            data: stringToHex(message),
            type: "bytes",
          });
          return { family, address, signature, nonce };
        }
        case "cosmos": {
          const address = cosmos.address ?? (await cosmos.connect());
          const { nonce, issuedAt } = await requestNonce(family, address);
          const message = buildWalletMessage({ family, address, nonce, issuedAt });
          const { signature, publicKey } = await cosmos.signMessage(message);
          return { family, address, signature, nonce, publicKey };
        }
        case "sui": {
          const address = sui.address ?? (await sui.connect());
          const { nonce, issuedAt } = await requestNonce(family, address);
          const message = buildWalletMessage({ family, address, nonce, issuedAt });
          // The wallet-standard signature embeds the public key.
          const { signature } = await sui.signPersonalMessage(message);
          return { family, address, signature, nonce };
        }
        case "starknet": {
          const address = starknet.address ?? (await starknet.connect());
          const { nonce, issuedAt } = await requestNonce(family, address);
          const message = buildWalletMessage({ family, address, nonce, issuedAt });
          // Accounts return an array of felts; travel as JSON, verified
          // on-chain via is_valid_signature.
          const felts = await starknet.signTypedData(buildStarknetTypedData(message));
          return { family, address, signature: JSON.stringify(felts), nonce };
        }
        case "near": {
          const address = near.address ?? (await near.connect());
          const { nonce, issuedAt } = await requestNonce(family, address);
          const message = buildWalletMessage({ family, address, nonce, issuedAt });
          // NEP-413 wants a 32-byte nonce — both sides stretch the issued
          // nonce through SHA-256 (see verifiers/near.ts).
          const { sha256 } = await import("@noble/hashes/sha2.js");
          const nonce32 = sha256(new TextEncoder().encode(nonce));
          const { signature, publicKey } = await near.signMessage(
            message,
            nonce32,
            NEAR_SIGN_RECIPIENT,
          );
          return { family, address, signature, nonce, publicKey };
        }
        case "tron": {
          const address = tron.address ?? (await tron.connect());
          const { nonce, issuedAt } = await requestNonce(family, address);
          const message = buildWalletMessage({ family, address, nonce, issuedAt });
          const signature = await tron.signMessage(message);
          return { family, address, signature, nonce };
        }
        case "cardano": {
          const address = cardano.address ?? (await cardano.connect());
          const { nonce, issuedAt } = await requestNonce(family, address);
          const message = buildWalletMessage({ family, address, nonce, issuedAt });
          const { signature, key } = await cardano.signData(message);
          return { family, address, signature, nonce, publicKey: key };
        }
        case "ton": {
          const address = ton.address ?? (await ton.connect());
          const { nonce, issuedAt } = await requestNonce(family, address);
          const message = buildWalletMessage({ family, address, nonce, issuedAt });
          const { signature, publicKey, timestamp, domain } =
            await ton.signMessage(message);
          return {
            family,
            address,
            signature,
            nonce,
            publicKey,
            timestamp,
            domain,
          };
        }
        case "hedera": {
          const address = hedera.address ?? (await hedera.connect());
          const { nonce, issuedAt } = await requestNonce(family, address);
          const message = buildWalletMessage({ family, address, nonce, issuedAt });
          const { signature, publicKey } = await hedera.signMessage(message);
          return { family, address, signature, nonce, publicKey };
        }
      }
    },
    [
      evm,
      solana,
      aptos,
      cosmos,
      sui,
      starknet,
      near,
      tron,
      cardano,
      ton,
      hedera,
      substrateAccount,
      setAccounts,
      setSelectedAccount,
      setChainFamily,
    ],
  );

  return { collectProof };
};
