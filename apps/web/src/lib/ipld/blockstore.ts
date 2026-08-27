import type { CID } from "@autonomys/auto-dag-data";

/**
 * The tiny in-memory block store `@autonomys/auto-dag-data` needs while it
 * builds a file's IPLD DAG.
 *
 * It deliberately does *not* come from `blockstore-core`. auto-dag-data is
 * built against that package's v5 contract, where `get()` resolves to the
 * stored `Uint8Array`; from v7 on, `get()` is a generator that *yields*
 * byte chunks instead. Nothing catches the mismatch at build time —
 * auto-dag-data ships no blockstore-core of its own for TypeScript to check
 * against — so the break is silent and only bites the single-chunk path
 * (the only one that reads a block back): every file small enough to fit in
 * one node failed with the library's opaque "Invalid data".
 *
 * Owning the ~20 lines removes the version coupling for good. auto-dag-data
 * calls exactly three methods on the store — `put`, `get`, `delete` — and
 * one DAG build is one short-lived instance, so a Map is the whole
 * implementation.
 */
export class IpldMemoryBlockstore {
  private readonly blocks = new Map<string, Uint8Array>();

  put(cid: CID, bytes: Uint8Array): CID {
    this.blocks.set(cid.toString(), bytes);
    return cid;
  }

  get(cid: CID): Uint8Array {
    const bytes = this.blocks.get(cid.toString());
    if (!bytes) throw new Error(`Block ${cid.toString()} is not in the store.`);
    return bytes;
  }

  delete(cid: CID): void {
    this.blocks.delete(cid.toString());
  }
}
