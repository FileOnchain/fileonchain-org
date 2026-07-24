import { describe, expect, it } from "vitest";
import {
  MICRO_PER_USDC,
  formatMicroUsdc,
  microToUsdc,
  usdcToMicro,
} from "@/lib/usdc";

/** Micro-USDC is the webapp's single source of truth for credit amounts
 *  (server `credit_ledger.delta_micro_usdc`, the `deposits.amount_micro_usdc`
 *  column, the deposit-confirm route's body checks, and the deposits-watch
 *  amount match). Every display in the dashboard rounds through
 *  `microToUsdc` / `formatMicroUsdc`; every request body hits `usdcToMicro`.
 *  A drift here is silent — a one-cent rounding bug either credits a
 *  deposit twice or rejects one the chain confirmed. */

/** Helper for the
 *  `12.50 USDC` / `0.0001 USDC` split: 2 decimals for round values,
 *  4 for sub-cent. The test pins that contract. */
const stripThousands = (formatted: string): string =>
  formatted.replace(/,/g, "");

describe("MICRO_PER_USDC", () => {
  it("is the protocol's 6-decimal USDC scaling factor", () => {
    expect(MICRO_PER_USDC).toBe(1_000_000n);
  });
});

describe("usdcToMicro", () => {
  it("scales a whole-dollar amount by 1e6", () => {
    expect(usdcToMicro(5)).toBe(5_000_000n);
  });

  it("rounds sub-cent display values to the nearest micro-USDC", () => {
    // 0.1 USDC = 100_000 micro-USDC exactly; the router and the
    // deposits-create endpoint accept fractional input.
    expect(usdcToMicro(0.1)).toBe(100_000n);
    // 12.3456 USDC = 12_345_600 micro-USDC; the next cent is
    // unrepresentable but the function still floors correctly.
    expect(usdcToMicro(12.3456)).toBe(12_345_600n);
  });

  it("rounds-bankers 0.0000005 to the nearest micro-USDC (no silent floor)", () => {
    // `Math.round` (= "round half away from zero") produces 1 here.
    // Pinning the behaviour so a swap to `Math.floor` (which would
    // silently under-credit) is caught at build time.
    expect(usdcToMicro(0.0000005)).toBe(1n);
  });

  it("accepts zero and produces a zero bigint", () => {
    expect(usdcToMicro(0)).toBe(0n);
  });
});

describe("microToUsdc", () => {
  it("divides by 1e6 into a JS number", () => {
    expect(microToUsdc(5_000_000n)).toBe(5);
    expect(microToUsdc(100_000n)).toBe(0.1);
  });

  it("preserves sub-cent precision without silent rounding", () => {
    // 1 micro-USDC = 0.000001 USDC exactly. The display layer
    // (formatMicroUsdc) decides whether to surface 4 decimals.
    expect(microToUsdc(1n)).toBe(0.000001);
    expect(microToUsdc(12_345_600n)).toBe(12.3456);
  });

  it("round-trips usdcToMicro for a representative amount", () => {
    const original = 12.5;
    expect(microToUsdc(usdcToMicro(original))).toBe(original);
  });

  it("round-trips usdcToMicro for a sub-cent amount", () => {
    const original = 0.0001;
    expect(microToUsdc(usdcToMicro(original))).toBe(original);
  });
});

describe("formatMicroUsdc", () => {
  it("formats a whole-dollar amount with two decimals and the USDC suffix", () => {
    expect(stripThousands(formatMicroUsdc(12_500_000n))).toBe("12.50 USDC");
  });

  it("formats a sub-cent amount with four decimals (no cents lost)", () => {
    // 0.0001 USDC = 100 micro-USDC. The 2-decimal formatter would
    // hide this whole amount behind `0.00 USDC` — the 4-decimal
    // branch keeps it visible.
    expect(stripThousands(formatMicroUsdc(100n))).toBe("0.0001 USDC");
  });

  it("formats a zero balance with two decimals", () => {
    expect(stripThousands(formatMicroUsdc(0n))).toBe("0.00 USDC");
  });

  it("separates thousands in the integer part", () => {
    // 1,234,567,890 micro-USDC = 1234.567890 USDC. The non-integer
    // cents push the formatter to 4 decimals, but the thousands
    // comma still appears on the integer part.
    const formatted = formatMicroUsdc(1_234_567_890n);
    expect(formatted.startsWith("1,234.")).toBe(true);
    expect(formatted.endsWith("USDC")).toBe(true);
  });

  it("uses two decimals when the value is exactly two fractional digits", () => {
    // 0.50 USDC = 500_000 micro-USDC. 500_000 * 100 = 50_000_000
    // (integer) → two-decimal branch. Without the integer check the
    // formatter would emit `0.5000 USDC` and mislead users into
    // thinking they had half a cent more than they do.
    expect(stripThousands(formatMicroUsdc(500_000n))).toBe("0.50 USDC");
  });
});
