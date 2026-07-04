"use client";

import * as React from "react";
import { getVisibleChains, type ChainConfig } from "@fileonchain/sdk";
import { hydratePreferences, usePreferencesStates } from "@/states/preferences";

/**
 * Chains the UI should offer, honoring the user's "show testnets"
 * preference. Hydrates the preferences store on first use so the list is
 * correct even on pages that never visit the preferences screen.
 */
export const useVisibleChains = (): readonly ChainConfig[] => {
  const showTestnets = usePreferencesStates((s) => s.showTestnets);
  const hydrated = usePreferencesStates((s) => s.hydrated);

  React.useEffect(() => {
    if (!hydrated) hydratePreferences();
  }, [hydrated]);

  return React.useMemo(() => getVisibleChains(showTestnets), [showTestnets]);
};

export default useVisibleChains;
