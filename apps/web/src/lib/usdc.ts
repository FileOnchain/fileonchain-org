/**
 * Micro-USDC helpers (6 decimals, matching CachePayments.sol / the USDC
 * token). Isomorphic — used by server services and dashboard UI alike.
 */

export const MICRO_PER_USDC = 1_000_000n;

export const usdcToMicro = (usdc: number): bigint =>
  BigInt(Math.round(usdc * 1_000_000));

export const microToUsdc = (micro: bigint): number => Number(micro) / 1_000_000;

/** "12.50 USDC" — always two decimals; more only when sub-cent detail exists. */
export const formatMicroUsdc = (micro: bigint): string => {
  const value = microToUsdc(micro);
  const digits = Number.isInteger(value * 100) ? 2 : 4;
  return `${value.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })} USDC`;
};
