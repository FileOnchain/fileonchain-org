import { keccak256, stringToBytes } from "viem";

/* TODO: wire to ValidatorStaking / PlatformRegistry / FileRegistry reads on
 * each provisioned chain (and the anchor_registry views on Aptos / Sui /
 * Starknet / NEAR). Deterministic mock content so the /protocol page and
 * explorer widgets have something to display before deployments land. */

export interface MockValidator {
  address: string;
  /** FOCAT, whole tokens (display values). */
  stake: number;
  /** Lifetime tip rewards earned, FOCAT. */
  rewardsEarned: number;
  /** Disputes the validator sat on as a juror. */
  juryDuties: number;
  /** Times slashed for voting with the losing side. */
  slashes: number;
  active: boolean;
}

export interface MockPlatform {
  platformId: string;
  name: string;
  treasury: string;
  feeBps: number;
  active: boolean;
  /** Anchors attributed to this platform (mock lifetime count). */
  anchorsOriginated: number;
  /** Lifetime platform-share revenue, FOCAT. */
  revenueFoc: number;
}

export interface MockProtocolStats {
  totalStakedFoc: number;
  activeValidators: number;
  proposalsOpen: number;
  proposalsVerified: number;
  disputesResolved: number;
  /** Current fee split in bps. */
  feeSplit: { validatorBps: number; platformBps: number; protocolBps: number };
  /** Protocol treasury balance, FOCAT. */
  treasuryFoc: number;
}

const addr = (label: string): string =>
  `0x${keccak256(stringToBytes(`fileonchain-protocol:${label}`)).slice(2, 42)}`;

export const MOCK_VALIDATORS: MockValidator[] = [
  { address: addr("validator-1"), stake: 25_000, rewardsEarned: 1_842, juryDuties: 34, slashes: 0, active: true },
  { address: addr("validator-2"), stake: 18_500, rewardsEarned: 1_310, juryDuties: 27, slashes: 1, active: true },
  { address: addr("validator-3"), stake: 12_000, rewardsEarned: 905, juryDuties: 19, slashes: 0, active: true },
  { address: addr("validator-4"), stake: 8_000, rewardsEarned: 611, juryDuties: 12, slashes: 0, active: true },
  { address: addr("validator-5"), stake: 5_500, rewardsEarned: 402, juryDuties: 9, slashes: 2, active: true },
  { address: addr("validator-6"), stake: 3_000, rewardsEarned: 214, juryDuties: 4, slashes: 0, active: true },
  { address: addr("validator-7"), stake: 750, rewardsEarned: 96, juryDuties: 0, slashes: 0, active: false },
];

export const MOCK_PLATFORMS: MockPlatform[] = [
  {
    platformId: "1",
    name: "FileOnChain",
    treasury: addr("platform-fileonchain"),
    feeBps: 2_500,
    active: true,
    anchorsOriginated: 12_480,
    revenueFoc: 3_120,
  },
  {
    platformId: "2",
    name: "Partner API (example)",
    treasury: addr("platform-partner"),
    feeBps: 2_000,
    active: true,
    anchorsOriginated: 2_140,
    revenueFoc: 428,
  },
  {
    platformId: "3",
    name: "MCP agents",
    treasury: addr("platform-mcp"),
    feeBps: 1_500,
    active: true,
    anchorsOriginated: 640,
    revenueFoc: 96,
  },
];

export interface MockFocatHolder {
  address: string;
  /** Best-effort label for known protocol addresses. */
  label?: string;
  /** What the address is in the protocol. */
  tag: "treasury" | "platform" | "validator" | "community";
  /** Liquid FOCAT balance (excludes stake). */
  balance: number;
  /** FOCAT locked in ValidatorStaking. */
  staked: number;
  /**
   * ERC20Votes voting power — own delegation plus received delegations.
   * Zero when the holder delegated away (or, for the timelock, never votes).
   */
  votingPower: number;
}

/**
 * FOCAT holder board: the protocol treasury, platform treasuries, validators
 * (liquid rewards + locked stake), and community delegates. Balances reuse
 * the validator/platform mocks above so the boards agree with each other.
 */
export const MOCK_FOCAT_HOLDERS: MockFocatHolder[] = [
  {
    address: addr("timelock-treasury"),
    label: "Protocol treasury",
    tag: "treasury",
    balance: 5_960,
    staked: 0,
    votingPower: 0,
  },
  ...MOCK_PLATFORMS.map(
    (platform): MockFocatHolder => ({
      address: platform.treasury,
      label: platform.name,
      tag: "platform",
      balance: platform.revenueFoc,
      staked: 0,
      votingPower: platform.revenueFoc,
    }),
  ),
  ...MOCK_VALIDATORS.map(
    (validator, i): MockFocatHolder => ({
      address: validator.address,
      tag: "validator",
      balance: validator.rewardsEarned,
      staked: validator.stake,
      // Validators self-delegate their liquid rewards; the largest also
      // collects community delegations.
      votingPower: validator.rewardsEarned + (i === 0 ? 6_550 : 0),
    }),
  ),
  { address: addr("community-1"), tag: "community", balance: 9_200, staked: 0, votingPower: 11_650 },
  { address: addr("community-2"), tag: "community", balance: 4_100, staked: 0, votingPower: 0 },
  { address: addr("community-3"), tag: "community", balance: 2_450, staked: 0, votingPower: 2_450 },
  { address: addr("community-4"), tag: "community", balance: 1_180, staked: 0, votingPower: 1_180 },
];

export const MOCK_PROTOCOL_STATS: MockProtocolStats = {
  totalStakedFoc: MOCK_VALIDATORS.filter((v) => v.active).reduce((sum, v) => sum + v.stake, 0),
  activeValidators: MOCK_VALIDATORS.filter((v) => v.active).length,
  proposalsOpen: 37,
  proposalsVerified: 15_223,
  disputesResolved: 42,
  feeSplit: { validatorBps: 6_000, platformBps: 2_500, protocolBps: 1_500 },
  treasuryFoc: 5_960,
};
