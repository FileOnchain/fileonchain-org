"use client";

import * as React from "react";
import type { ChainCostEstimate } from "@/lib/costs";
import { useCostsStates } from "@/states/costs";

/** One fetch per page load, shared by every consumer of the hook. */
let hydrationStarted = false;

/**
 * Per-chain anchoring cost estimates for upload surfaces. Renders the
 * synchronous seed table immediately, then hydrates the store once per
 * page load from `GET /api/costs` — live gas / fee quotes plus USD
 * prices where the server could get them, seed rows where it couldn't.
 */
export const useCostEstimates = (): ChainCostEstimate[] => {
  const estimates = useCostsStates((state) => state.estimates);

  React.useEffect(() => {
    if (hydrationStarted || useCostsStates.getState().source === "real") return;
    hydrationStarted = true;
    void (async () => {
      try {
        const res = await fetch("/api/costs");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = (await res.json()) as { estimates?: ChainCostEstimate[] };
        if (Array.isArray(body.estimates) && body.estimates.length > 0) {
          useCostsStates.getState().setEstimates(body.estimates);
        }
      } catch {
        // Seed table stays — allow a retry on the next mount.
        hydrationStarted = false;
      }
    })();
  }, []);

  return estimates;
};
