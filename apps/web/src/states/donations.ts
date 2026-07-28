import { create } from "zustand";
import { MOCK_DONATIONS, type MockDonation } from "@/lib/mock/donations";

/** Where the current `feed` came from. `"seed"` means we still hold
 *  the marketing/dev fallback rows from `MOCK_DONATIONS`; `"real"`
 *  means a successful `/api/donations/recent` fetch (or a real
 *  on-chain donation) replaced them. The count badges in
 *  `DonationImpactStrip` rely on this flag to know whether the
 *  feed is authoritative. */
export type DonationsDataSource = "seed" | "real";

interface DonationsState {
  feed: MockDonation[];
  source: DonationsDataSource;
  addDonation: (donation: MockDonation) => void;
  /** Replace the entire feed. Used by `DonationsFeed` after a
   *  successful `/api/donations/recent` fetch so the marketing seed
   *  is cleared rather than merged with the real rows. Marks the
   *  source as `"real"`. */
  setFeed: (donations: MockDonation[]) => void;
}

export const useDonationsStates = create<DonationsState>((set) => ({
  feed: MOCK_DONATIONS,
  source: "seed",
  addDonation: (donation) =>
    set((state) => ({
      feed: [donation, ...state.feed],
      // Any new donation from `useDonation.donate` is the user's own
      // on-chain tx — authoritative, so the seed is gone.
      source: "real",
    })),
  setFeed: (donations) => set({ feed: donations, source: "real" }),
}));