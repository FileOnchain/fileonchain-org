import type { ChainId } from "@fileonchain/sdk";
import type { ByokProvider } from "@/lib/db/schema";

/**
 * Registry of bring-your-own-key providers — networks with their own
 * API-key upload systems where users may already hold credit. Isomorphic:
 * the dashboard renders it and the anchor service enforces it.
 */

export interface ByokProviderInfo {
  id: ByokProvider;
  name: string;
  description: string;
  keyFormatHint: string;
  docsUrl: string;
  /** Chains an upload may route through this provider. */
  chainIds: ChainId[];
}

export const BYOK_PROVIDERS: ByokProviderInfo[] = [
  {
    id: "autonomys-auto-drive",
    name: "Autonomys Auto Drive",
    description:
      "Use your own Auto Drive API key so uploads to Autonomys spend your existing Auto Drive credit instead of FileOnChain credits.",
    keyFormatHint: "API key from ai3.storage (Auto Drive dashboard)",
    docsUrl: "https://develop.autonomys.xyz/sdk/auto-drive",
    chainIds: ["substrate:autonomys-mainnet", "substrate:autonomys-taurus"],
  },
];

export const getByokProvider = (id: string): ByokProviderInfo | undefined =>
  BYOK_PROVIDERS.find((provider) => provider.id === id);

export const isByokProvider = (value: unknown): value is ByokProvider =>
  typeof value === "string" && BYOK_PROVIDERS.some((p) => p.id === value);
