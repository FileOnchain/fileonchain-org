"use client";

import { NetworkId } from "@autonomys/auto-utils";
import { ApiPromise } from "@polkadot/api";
import { SubmittableExtrinsic } from "@polkadot/api/types";
import { Account } from "@/types/types";
import { ChunkData } from "./generateCIDs";

type UploadSetters = {
  setError: (error: string) => void;
  setIsUploading: (isUploading: boolean) => void;
  setTxHash: (hash: string) => void;
};

export const uploadChunks = async (
  api: ApiPromise,
  account: Account,
  cids: ChunkData[],
  networkId: NetworkId,
  { setError, setIsUploading, setTxHash }: UploadSetters
) => {
  try {
    const cidList = cids.map((chunk) => ({
      cid: chunk.cid.toString(),
      nextCid: chunk.nextCid ? chunk.nextCid.toString() : undefined,
    }));
    const chunkTxs: SubmittableExtrinsic<"promise">[] = cids.map((chunk) =>
      api.tx.system.remarkWithEvent(
        JSON.stringify({
          cid: chunk.cid.toString(),
          data: Array.from(chunk.data),
          nextCid: chunk.nextCid ? chunk.nextCid.toString() : null,
        })
      )
    );

    const batchTx = api.tx.utility.batch(chunkTxs);
    const blockNumber = await api.query.system.number();

    await batchTx.signAndSend(
      account.address,
      { nonce: -1 },
      ({ status, events, dispatchError, txHash }) => {
        setIsUploading(true);
        if (dispatchError) {
          if (dispatchError.isModule) {
            const decoded = api.registry.findMetaError(dispatchError.asModule);
            const { name, section } = decoded;
            setError(`${section}.${name}`);
          } else {
            setError(dispatchError.toString());
          }
          return;
        }

        const hash = txHash.toHex();
        if (status.isInBlock) {
          setIsUploading(false);
          setTxHash(hash);
          console.log("Included at block hash", status.asInBlock.toHex());
          console.log(
            "Events:",
            events.map(({ event }) => event.toHuman())
          );
          fetch("/api/upload-fallback", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ network: networkId, cidList, hash, blockNumber }),
          });
        } else if (status.isFinalized) {
          setIsUploading(false);
          setTxHash(hash);
          console.log("Finalized block hash", status.asFinalized.toHex());
        }
      }
    );
  } catch (error) {
    console.error(error);
    setError("Failed to upload chunks. Please try again.");
  }
};
