import { create } from "zustand";
import { MOCK_DONATIONS, type MockDonation } from "@/lib/mock/donations";

interface DonationsState {
  feed: MockDonation[];
  addDonation: (donation: MockDonation) => void;
}

export const useDonationsStates = create<DonationsState>((set) => ({
  feed: MOCK_DONATIONS,
  addDonation: (donation) =>
    set((state) => ({ feed: [donation, ...state.feed] })),
}));