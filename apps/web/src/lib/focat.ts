import type { ChainConfig } from "@fileonchain/sdk";

/**
 * FOCAT acquisition catalog — client-safe, shared by the upload top-up UI
 * and the order API.
 *
 * Two users need FOCAT in two different ways, and the webapp deliberately
 * optimizes for not making most people touch the token at all:
 *
 * - **Credits / API** (the default): the server worker signs proposeAnchor
 *   and spends FOCAT from the treasury signer; users pay USD credits and
 *   never see the token.
 * - **Pay-as-you-go (wallet)**: the user's own wallet escrows tip + bond
 *   on-chain, so it must hold FOCAT. For that path we sell fixed-price
 *   **anchor packs** — "enough to propose on this chain", not a trading
 *   desk. Positioning matters: this is a verification fee product, never
 *   an investment.
 *
 * Testnets never sell: they drip from a free faucet.
 */

/** Families whose registries run the propose/verify protocol. */
const PROTOCOL_FAMILIES = new Set(["evm", "aptos", "sui", "starknet", "near"]);

/** Whether PAYG anchors on this chain escrow FOCAT (tip + bond). */
export const isProtocolChain = (chain: ChainConfig): boolean =>
  PROTOCOL_FAMILIES.has(chain.family);

/**
 * What one propose escrows, in whole FOCAT (protocol defaults). The bond
 * returns after unchallenged verification — the tip is the real cost.
 * TODO: read minTip/proposeBond from the chain's registry once provisioned.
 */
export const ANCHOR_ESCROW = { tipFocat: 1, bondFocat: 100 } as const;

/**
 * v1 fixed pricing: FOCAT_USD_RATE is set operationally and adjusted via
 * admin/governance; the pack price is amount × rate × markup. TODO: replace
 * with the governance formula ((minTip + proposeBond) × $FOCAT × markup)
 * fed by a price feed once a DEX exists.
 */
export const FOCAT_USD_RATE = 0.02;
export const PACK_MARKUP = 1.25;

export type FocatPackId = "anchor-pack" | "validator-starter" | "custom";

export interface FocatPack {
  id: FocatPackId;
  name: string;
  /** Whole FOCAT delivered; null = user-defined (custom top-up). */
  focatAmount: number | null;
  description: string;
}

export const FOCAT_PACKS: readonly FocatPack[] = [
  {
    id: "anchor-pack",
    name: "Anchor pack",
    // tip + bond + small buffer so one propose always clears.
    focatAmount: ANCHOR_ESCROW.tipFocat + ANCHOR_ESCROW.bondFocat + 9,
    description:
      "Enough for one verified anchor on this chain: the tip, the refundable bond, and a small buffer.",
  },
  {
    id: "validator-starter",
    name: "Validator starter",
    // protocol min stake (1000) + one propose escrow.
    focatAmount: 1_100,
    description:
      "Minimum validator stake plus one propose — start earning the 60% tip share and sit on juries.",
  },
  {
    id: "custom",
    name: "Custom top-up",
    focatAmount: null,
    description: "Pick an amount (power users).",
  },
] as const;

export const MAX_CUSTOM_FOCAT = 10_000;

export const getFocatPack = (id: FocatPackId): FocatPack =>
  FOCAT_PACKS.find((pack) => pack.id === id) ?? FOCAT_PACKS[0];

/** Fixed USD price for a whole-FOCAT amount (0 would mean faucet). */
export const packPriceUsd = (focatAmount: number): number =>
  Math.ceil(focatAmount * FOCAT_USD_RATE * PACK_MARKUP * 100) / 100;

export const formatFocat = (amount: number): string => `${amount.toLocaleString()} FOCAT`;
