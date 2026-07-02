import type { ApiPromise } from "@polkadot/api";
import type { Signer } from "@polkadot/api/types";
import { getChain, type ChainConfig } from "../chains";
import { isValidCID } from "../cid";
import type { ChainId } from "../types";

/**
 * Substrate client. Anchors are `system.remarkWithEvent` extrinsics carrying
 * a versioned JSON payload, so any indexer can find and parse them without
 * bespoke chain state. Anchoring a folder is identical to anchoring a file —
 * pass the CID of the folder's DAG root.
 */

/** Versioned remark payload written on-chain for every anchor. */
export interface AnchorRemark {
  /** Protocol tag — always "fileonchain". */
  p: "fileonchain";
  /** Payload version. */
  v: 1;
  op: "anchor";
  /** CIDv1 of the file, or of the folder's DAG root. */
  cid: string;
  /** Optional SHA-256 (hex) of the raw content. */
  sha256?: string;
  /** Optional IPFS / Arweave pointer. */
  uri?: string;
}

export interface BuildAnchorRemarkParams {
  cid: string;
  sha256?: string;
  uri?: string;
}

/** Serialize the anchor payload stored in the remark. */
export const buildAnchorRemark = ({ cid, sha256, uri }: BuildAnchorRemarkParams): string => {
  if (!isValidCID(cid)) throw new Error(`"${cid}" is not a valid CIDv1 base32 string.`);
  const remark: AnchorRemark = { p: "fileonchain", v: 1, op: "anchor", cid: cid.trim() };
  if (sha256) remark.sha256 = sha256;
  if (uri) remark.uri = uri;
  return JSON.stringify(remark);
};

/** Parse a remark back into an anchor payload; null if it isn't one of ours. */
export const parseAnchorRemark = (remark: string): AnchorRemark | null => {
  try {
    const parsed = JSON.parse(remark) as Partial<AnchorRemark>;
    if (parsed.p !== "fileonchain" || parsed.v !== 1 || parsed.op !== "anchor") return null;
    if (typeof parsed.cid !== "string" || !isValidCID(parsed.cid)) return null;
    return parsed as AnchorRemark;
  } catch {
    return null;
  }
};

/**
 * Resolve a `substrate:*` chain that anchors via remarks, or throw with a
 * message that says exactly what's missing.
 */
export const resolveSubstrateChain = (chainId: ChainId): ChainConfig => {
  const chain = getChain(chainId);
  if (!chain) throw new Error(`Unknown chain "${chainId}".`);
  if (chain.family !== "substrate") {
    throw new Error(`Chain "${chainId}" is not a Substrate chain; use the ${chain.family} client instead.`);
  }
  if (chain.palletContract !== "system.remarkWithEvent") {
    throw new Error(`Chain "${chainId}" does not support remark anchoring.`);
  }
  return chain;
};

export interface SubstrateAnchorParams extends BuildAnchorRemarkParams {
  /** A `substrate:*` chain id, e.g. "substrate:autonomys-mainnet". */
  chainId: ChainId;
  /** SS58 address submitting the extrinsic. */
  address: string;
  /** Injected signer (e.g. from a browser extension); omit for a keyring pair address. */
  signer?: Signer;
}

export interface SubstrateAnchorReceipt {
  txHash: string;
  blockHash: string;
  remark: string;
}

/**
 * Anchor a CID with `system.remarkWithEvent`, resolving once the extrinsic
 * is included in a block. The caller owns the `api` connection lifecycle.
 */
export const anchorCIDWithRemark = async (
  api: ApiPromise,
  { chainId, address, signer, ...payload }: SubstrateAnchorParams
): Promise<SubstrateAnchorReceipt> => {
  resolveSubstrateChain(chainId);
  const remark = buildAnchorRemark(payload);
  const tx = api.tx.system.remarkWithEvent(remark);

  return new Promise((resolve, reject) => {
    let unsubscribe: (() => void) | undefined;
    const settle = (fn: () => void) => {
      unsubscribe?.();
      fn();
    };
    tx.signAndSend(address, signer ? { signer } : {}, ({ status, dispatchError, txHash }) => {
      if (dispatchError) {
        if (dispatchError.isModule) {
          const decoded = api.registry.findMetaError(dispatchError.asModule);
          settle(() =>
            reject(new Error(`${decoded.section}.${decoded.name}: ${decoded.docs.join(" ")}`))
          );
        } else {
          settle(() => reject(new Error(dispatchError.toString())));
        }
        return;
      }
      if (status.isInBlock) {
        settle(() =>
          resolve({
            txHash: txHash.toHex(),
            blockHash: status.asInBlock.toHex(),
            remark,
          })
        );
      }
    })
      .then((unsub) => {
        unsubscribe = unsub;
      })
      .catch(reject);
  });
};
