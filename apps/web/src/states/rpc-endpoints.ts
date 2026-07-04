import { create } from "zustand";
import { getChain, type ChainId } from "@fileonchain/sdk";
import { validateRpcUrl, type CustomRpcMap } from "@/lib/rpc-endpoints";

/**
 * Client-side mirror of the account's custom RPC endpoints. Anchor code
 * reads it synchronously (via `getRpcOverrides`) when building requests; the
 * dashboard RPC page persists changes to the server and pushes the resulting
 * map here. Same localStorage-mirror pattern as states/preferences.ts.
 */

const RPC_ENDPOINTS_STORAGE_KEY = "fileonchain-rpc-endpoints";

interface RpcEndpointsState {
  endpoints: CustomRpcMap;
  hydrated: boolean;
  /** Replace the whole map (the API returns the full resulting map). */
  setLocalEndpoints: (endpoints: CustomRpcMap) => void;
}

/** Drop entries whose chain vanished from the registry or whose URL is bad. */
const sanitize = (raw: Record<string, unknown>): CustomRpcMap => {
  const out: CustomRpcMap = {};
  for (const [chainId, url] of Object.entries(raw)) {
    if (typeof url !== "string") continue;
    const chain = getChain(chainId as ChainId);
    if (!chain || validateRpcUrl(chain.family, url)) continue;
    out[chain.id] = url;
  }
  return out;
};

const readStored = (): CustomRpcMap => {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(RPC_ENDPOINTS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return sanitize(parsed as Record<string, unknown>);
  } catch {
    return {};
  }
};

export const useRpcEndpointsStates = create<RpcEndpointsState>((set) => ({
  endpoints: {},
  hydrated: false,
  setLocalEndpoints: (endpoints) => {
    set({ endpoints });
    if (typeof window !== "undefined") {
      window.localStorage.setItem(
        RPC_ENDPOINTS_STORAGE_KEY,
        JSON.stringify(endpoints),
      );
    }
  },
}));

// Hydrate from localStorage after mount so SSR markup stays deterministic —
// same pattern as states/preferences.ts.
export const hydrateRpcEndpoints = () => {
  if (typeof window === "undefined") return;
  if (useRpcEndpointsStates.getState().hydrated) return;
  useRpcEndpointsStates.setState({ endpoints: readStored(), hydrated: true });
};

/**
 * Synchronous accessor for non-React code (anchor senders, wallet hooks) —
 * hydrates on first use so callbacks see the stored map even before any
 * subscribed component mounted.
 */
export const getRpcOverrides = (): CustomRpcMap => {
  hydrateRpcEndpoints();
  return useRpcEndpointsStates.getState().endpoints;
};
