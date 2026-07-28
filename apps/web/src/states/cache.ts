import { create } from "zustand";
import { MOCK_CACHE_ENTRIES, type MockCacheEntry } from "@/lib/mock/cache";

/** Where the current `entries` came from. `"seed"` means we still
 *  hold the marketing/dev fallback rows from `MOCK_CACHE_ENTRIES`;
 *  `"real"` means a successful server fetch (or a real on-chain
 *  payment) replaced them. Components rendering count badges or the
 *  per-entry list rely on this flag to know whether the rows they're
 *  looking at are authoritative. */
export type CacheDataSource = "seed" | "real";

interface CacheState {
  entries: MockCacheEntry[];
  source: CacheDataSource;
  addEntry: (entry: MockCacheEntry) => void;
  /** Replace the entire entries list. Used by `CacheMyList` after a
   *  successful `/api/cache/entries` fetch so the marketing seed is
   *  cleared rather than merged with the real rows. Marks the source
   *  as `"real"`. */
  setEntries: (entries: MockCacheEntry[]) => void;
  grantAccess: (id: `0x${string}`, address: `0x${string}`) => void;
  revokeAccess: (id: `0x${string}`, address: `0x${string}`) => void;
  removeEntry: (id: `0x${string}`) => void;
}

export const useCacheStates = create<CacheState>((set) => ({
  entries: MOCK_CACHE_ENTRIES,
  source: "seed",
  addEntry: (entry) =>
    set((state) => ({
      entries: [
        entry,
        ...state.entries.filter((e) => e.id !== entry.id),
      ],
      // Any new entry from `useCachePayment.pay` is the user's own
      // on-chain purchase — that's authoritative, so the seed is gone.
      source: "real",
    })),
  setEntries: (entries) => set({ entries, source: "real" }),
  grantAccess: (id, address) =>
    set((state) => ({
      entries: state.entries.map((e) =>
        e.id === id && !e.allowList.includes(address)
          ? { ...e, allowList: [...e.allowList, address] }
          : e,
      ),
    })),
  revokeAccess: (id, address) =>
    set((state) => ({
      entries: state.entries.map((e) =>
        e.id === id
          ? { ...e, allowList: e.allowList.filter((a) => a !== address) }
          : e,
      ),
    })),
  removeEntry: (id) =>
    set((state) => ({ entries: state.entries.filter((e) => e.id !== id) })),
}));