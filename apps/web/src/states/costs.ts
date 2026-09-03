import { create } from "zustand";
import { getSeedCostEstimates, type ChainCostEstimate } from "@/lib/costs";

/** Where the current `estimates` came from. `"seed"` means the static
 *  fallback table from `lib/costs.ts`; `"real"` means a successful
 *  `/api/costs` fetch replaced it with server-quoted rows (which are
 *  themselves per-row `source: "seed" | "live"` — a dead RPC keeps a
 *  chain on its seed row even inside a real payload). */
export type CostsDataSource = "seed" | "real";

interface CostsState {
  estimates: ChainCostEstimate[];
  source: CostsDataSource;
  /** Replace the whole table after a successful `/api/costs` fetch. */
  setEstimates: (estimates: ChainCostEstimate[]) => void;
}

export const useCostsStates = create<CostsState>((set) => ({
  estimates: getSeedCostEstimates(),
  source: "seed",
  setEstimates: (estimates) => set({ estimates, source: "real" }),
}));
