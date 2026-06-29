import { create } from "zustand";
import { MOCK_CACHE_ENTRIES, type MockCacheEntry } from "@/lib/mock/cache";

interface CacheState {
  entries: MockCacheEntry[];
  addEntry: (entry: MockCacheEntry) => void;
  grantAccess: (id: `0x${string}`, address: `0x${string}`) => void;
  revokeAccess: (id: `0x${string}`, address: `0x${string}`) => void;
  removeEntry: (id: `0x${string}`) => void;
}

export const useCacheStates = create<CacheState>((set) => ({
  entries: MOCK_CACHE_ENTRIES,
  addEntry: (entry) =>
    set((state) => ({
      entries: [
        entry,
        ...state.entries.filter((e) => e.id !== entry.id),
      ],
    })),
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