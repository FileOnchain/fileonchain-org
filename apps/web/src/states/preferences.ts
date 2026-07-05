import { create } from "zustand";
import { getChain, DEFAULT_CHAIN_ID } from "@fileonchain/sdk";
import {
  DEFAULT_PREFERENCES,
  isDateFormatPreference,
  type DateFormatPreference,
} from "@/lib/preferences";
import { useChainsStates } from "@/states/chains";

/**
 * Client-side mirror of the display-affecting account preferences. It is the
 * live source for UI decisions (testnet visibility, date rendering, GA
 * gating) so signed-out visitors get sane defaults and signed-in users see
 * their choices without a round trip. The preferences page persists changes
 * to the server and pushes them here.
 */

const PREFERENCES_STORAGE_KEY = "fileonchain-preferences";

export interface LocalPreferences {
  showTestnets: boolean;
  dateFormat: DateFormatPreference;
  analyticsEnabled: boolean;
  uploadAdvisorEnabled: boolean;
}

interface PreferencesState extends LocalPreferences {
  hydrated: boolean;
  setLocalPreferences: (patch: Partial<LocalPreferences>) => void;
}

const localDefaults: LocalPreferences = {
  showTestnets: DEFAULT_PREFERENCES.showTestnets,
  dateFormat: DEFAULT_PREFERENCES.dateFormat,
  analyticsEnabled: DEFAULT_PREFERENCES.analyticsEnabled,
  uploadAdvisorEnabled: DEFAULT_PREFERENCES.uploadAdvisorEnabled,
};

/** Google's kill switch — gtag no-ops while this global is true. */
const applyGaOptOut = (analyticsEnabled: boolean) => {
  if (typeof window === "undefined") return;
  const gaId = process.env.NEXT_PUBLIC_GA_ID;
  if (!gaId) return;
  (window as unknown as Record<string, unknown>)[`ga-disable-${gaId}`] =
    !analyticsEnabled;
};

/** Hiding testnets while one is active would strand the picker — reset. */
const resetActiveChainIfHidden = (showTestnets: boolean) => {
  if (showTestnets) return;
  const { activeChainId, setActiveChainId } = useChainsStates.getState();
  if (getChain(activeChainId)?.testnet) setActiveChainId(DEFAULT_CHAIN_ID);
};

const readStored = (): Partial<LocalPreferences> => {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(PREFERENCES_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: Partial<LocalPreferences> = {};
    if (typeof parsed.showTestnets === "boolean")
      out.showTestnets = parsed.showTestnets;
    if (isDateFormatPreference(parsed.dateFormat))
      out.dateFormat = parsed.dateFormat;
    if (typeof parsed.analyticsEnabled === "boolean")
      out.analyticsEnabled = parsed.analyticsEnabled;
    if (typeof parsed.uploadAdvisorEnabled === "boolean")
      out.uploadAdvisorEnabled = parsed.uploadAdvisorEnabled;
    return out;
  } catch {
    return {};
  }
};

export const usePreferencesStates = create<PreferencesState>((set, get) => ({
  ...localDefaults,
  hydrated: false,
  setLocalPreferences: (patch) => {
    set(patch);
    const { showTestnets, dateFormat, analyticsEnabled, uploadAdvisorEnabled } =
      get();
    if (typeof window !== "undefined") {
      window.localStorage.setItem(
        PREFERENCES_STORAGE_KEY,
        JSON.stringify({
          showTestnets,
          dateFormat,
          analyticsEnabled,
          uploadAdvisorEnabled,
        }),
      );
    }
    if ("analyticsEnabled" in patch) applyGaOptOut(analyticsEnabled);
    if ("showTestnets" in patch) resetActiveChainIfHidden(showTestnets);
  },
}));

// Hydrate from localStorage after mount so SSR markup stays deterministic —
// same pattern as states/theme.ts.
export const hydratePreferences = () => {
  if (typeof window === "undefined") return;
  const stored = readStored();
  usePreferencesStates.setState({ ...stored, hydrated: true });
  applyGaOptOut(
    stored.analyticsEnabled ?? localDefaults.analyticsEnabled,
  );
  resetActiveChainIfHidden(stored.showTestnets ?? localDefaults.showTestnets);
};
