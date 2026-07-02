import { CID } from "@autonomys/auto-dag-data";
import { sha256 } from "multiformats/hashes/sha2";

export interface ChunkData {
  cid: CID;
  data: Uint8Array;
  nextCid?: CID;
}

// SHA-256 hash of a chunk, encoded as CIDv1 with the raw codec (0x55 would be
// dag-pb; 0x12 is sha2-256 — kept for parity with the previous implementation).
const SHA2_256_CODEC = 0x12;
const CID_VERSION = 1;

const chunkToCid = async (chunk: ArrayBuffer): Promise<CID> =>
  CID.create(
    CID_VERSION,
    SHA2_256_CODEC,
    await sha256.digest(new Uint8Array(chunk))
  );

export const generateCIDs = async (
  file: File,
  chunkSize: number
): Promise<ChunkData[]> => {
  const buffer = await file.arrayBuffer();
  const chunks: ArrayBuffer[] = [];
  for (let i = 0; i < buffer.byteLength; i += chunkSize) {
    chunks.push(buffer.slice(i, i + chunkSize));
  }

  return Promise.all(
    chunks.map(async (chunk, index) => {
      const cid = await chunkToCid(chunk);
      const nextCid =
        index + 1 < chunks.length ? await chunkToCid(chunks[index + 1]) : undefined;
      return { cid, data: new Uint8Array(chunk), nextCid };
    })
  );
};
