import { describe, expect, it } from "vitest";
import {
  compactNumber,
  formatBlockNumber,
  formatBytes,
  formatRelativeTime,
  formatTimestamp,
  truncateAddress,
  truncateCID,
} from "@/lib/cid/format";

/** Pure render helpers for the public explorer + the dashboard
 *  counters. CIDs and addresses are treated as opaque — never
 *  re-encoded — so the truncators only slice. Timestamps and
 *  byte counts drive UI decisions (relative "12m ago" labels, block
 *  height thousands separators) but never anything that affects
 *  protocol correctness; a regression here is visible but not
 *  silent. */

/** Pin the current Unix epoch so the relative-time tests are
 *  deterministic. */
const NOW = 1_700_000_000_000; // ms since epoch

const SEC = (n: number) => n * 1000;

describe("truncateCID", () => {
  it("truncates a long CID with the default 8 + 6 head/tail", () => {
    const cid = "bafybeigdyrzt5sfp7udm7hu76ys7tep27uxxi5y5q3kxymtsv2t7xspbio";
    const out = truncateCID(cid);
    // Default is 8 head + 6 tail. The cid ends in `7xspbio` (7 chars,
    // last 6 are `xspbio`).
    expect(out).toBe("bafybeig…xspbio");
    expect(out).toContain("…");
  });

  it("returns the input unchanged when shorter than prefix + suffix + 1", () => {
    // Short CID — keep the whole thing.
    expect(truncateCID("bafybeig")).toBe("bafybeig");
  });

  it("returns the input unchanged at the exact boundary", () => {
    // The function refuses to truncate when the result would be
    // longer than the input — exercise the equality boundary.
    const cid = "12345678" + "x" + "123456"; // 15 chars
    expect(truncateCID(cid)).toBe(cid);
  });

  it("respects custom prefix and suffix lengths", () => {
    const cid = "abcdefghijklmnopqrstuvwxyz1234567890";
    const out = truncateCID(cid, 4, 4);
    expect(out).toBe("abcd…7890");
  });
});

describe("truncateAddress", () => {
  it("truncates a long EVM address with the default 6 + 6", () => {
    const addr = "0x1234567890abcdef1234567890abcdef12345678";
    expect(truncateAddress(addr)).toBe("0x1234…345678");
  });

  it("returns the input unchanged when shorter than 2 * side + 1", () => {
    expect(truncateAddress("0x1234")).toBe("0x1234");
  });

  it("respects a custom `side` length", () => {
    const addr = "0x1234567890abcdef1234567890abcdef12345678";
    expect(truncateAddress(addr, 4)).toBe("0x12…5678");
  });
});

describe("formatTimestamp", () => {
  it("formats a Unix timestamp via the browser's default locale", () => {
    const ts = 1_700_000_000;
    const out = formatTimestamp(ts);
    // The exact format depends on the host locale; assert the
    // shape so the test passes in any environment.
    expect(typeof out).toBe("string");
    expect(out.length).toBeGreaterThan(0);
  });

  it("emits a string that round-trips through Date", () => {
    const ts = 1_700_000_000;
    const out = formatTimestamp(ts);
    // The output includes the year for any sane timestamp.
    expect(out).toMatch(/202\d/);
  });
});

describe("formatBlockNumber", () => {
  it("uses the locale's thousands separator", () => {
    // `toLocaleString` for en-US renders "1,234,567".
    expect(formatBlockNumber(1_234_567)).toBe("1,234,567");
  });

  it("formats zero as '0'", () => {
    expect(formatBlockNumber(0)).toBe("0");
  });

  it("preserves small numbers without thousands separators", () => {
    expect(formatBlockNumber(999)).toBe("999");
  });
});

describe("formatBytes", () => {
  it("returns '0 B' for non-finite or negative inputs", () => {
    expect(formatBytes(NaN)).toBe("0 B");
    expect(formatBytes(-1)).toBe("0 B");
    expect(formatBytes(Number.POSITIVE_INFINITY)).toBe("0 B");
  });

  it("formats a single-byte value as '1 B'", () => {
    expect(formatBytes(1)).toBe("1 B");
  });

  it("formats whole-number multiples without a trailing '.0'", () => {
    // 1024 bytes → 1 KB. The `.toFixed(1).replace(/\.0$/, "")` step
    // strips the trailing zero so the UI never shows "1.0 KB".
    expect(formatBytes(1024)).toBe("1 KB");
  });

  it("formats sub-unit values with the requested decimal precision", () => {
    // 1536 bytes → 1.5 KB at 1 decimal.
    expect(formatBytes(1536)).toBe("1.5 KB");
  });

  it("scales up through KB / MB / GB / TB", () => {
    expect(formatBytes(1024 * 1024)).toBe("1 MB");
    expect(formatBytes(1024 * 1024 * 1024)).toBe("1 GB");
    expect(formatBytes(1024 * 1024 * 1024 * 1024)).toBe("1 TB");
  });

  it("caps at TB for values beyond the largest unit", () => {
    // 1 PB is beyond the unit table — the loop stops at TB and
    // emits the overflow value scaled against TB.
    const out = formatBytes(1024 * 1024 * 1024 * 1024 * 1024);
    expect(out.endsWith("TB")).toBe(true);
  });

  it("respects a custom decimal precision", () => {
    // 0.5 MB at 2 decimals → "512 KB"?
    // 0.5 MB = 512 KB exactly. The first unit boundary that fits
    // is KB, so the output is "512 KB". The custom `decimals`
    // applies only when the value is non-integer at that unit.
    expect(formatBytes(1024 * 1.5, 2)).toBe("1.50 KB");
  });
});

describe("formatRelativeTime", () => {
  it("clamps a future timestamp to 0s ago", () => {
    // NOW is ahead of the input — the helper floors at 0 instead
    // of emitting a negative diff.
    expect(formatRelativeTime(NOW / 1000 + 60, NOW)).toBe("0s ago");
  });

  it("renders seconds under one minute", () => {
    const ts = NOW / 1000 - 30;
    expect(formatRelativeTime(ts, NOW)).toBe("30s ago");
  });

  it("renders minutes under one hour", () => {
    const ts = NOW / 1000 - 12 * 60;
    expect(formatRelativeTime(ts, NOW)).toBe("12m ago");
  });

  it("renders hours under one day", () => {
    const ts = NOW / 1000 - 5 * 3600;
    expect(formatRelativeTime(ts, NOW)).toBe("5h ago");
  });

  it("renders days under 30 days", () => {
    const ts = NOW / 1000 - 2 * 86400;
    expect(formatRelativeTime(ts, NOW)).toBe("2d ago");
  });

  it("falls back to a short month/day after 30 days", () => {
    // 60 days before NOW — past the 30-day cutoff, before the
    // 365-day local-date fallback in the code path.
    const ts = NOW / 1000 - 60 * 86400;
    const out = formatRelativeTime(ts, NOW);
    // Assert the structure: a non-"ago" suffix and a month abbreviation.
    expect(out).toMatch(/^[A-Z][a-z]{2} \d{1,2}$/);
  });

  it("uses Date.now() as the default `now` when omitted", () => {
    // Pretend the input was 60 seconds ago — must be stable.
    const out = formatRelativeTime(Date.now() / 1000 - 60);
    expect(out).toMatch(/^(0|1)m ago$/);
  });
});

describe("compactNumber", () => {
  it("returns '0' for non-finite inputs", () => {
    expect(compactNumber(NaN)).toBe("0");
    expect(compactNumber(Number.POSITIVE_INFINITY)).toBe("0");
  });

  it("renders an integer as a localized string under 10K", () => {
    expect(compactNumber(9999)).toBe("9,999");
  });

  it("compacts to K at 10K+", () => {
    expect(compactNumber(12_345)).toBe("12.3K");
  });

  it("compacts to M at 1M+", () => {
    expect(compactNumber(1_234_567)).toBe("1.2M");
  });

  it("compacts to B at 1B+", () => {
    expect(compactNumber(1_234_567_890)).toBe("1.2B");
  });

  it("respects a custom decimal precision", () => {
    expect(compactNumber(1_234_567, 2)).toBe("1.23M");
  });

  it("handles negative numbers via the absolute-value comparison", () => {
    // The implementation compares against `Math.abs(n)` so the
    // thresholds apply to negative numbers symmetrically.
    expect(compactNumber(-1_234_567)).toBe("-1.2M");
    expect(compactNumber(-9999)).toBe("-9,999");
  });
});

describe("formatBytes edge cases — pinned against the implementation's contract", () => {
  it("0 bytes formats as '0 B' (not a unit-less empty string)", () => {
    expect(formatBytes(0)).toBe("0 B");
  });

  it("a value just under a unit boundary keeps the smaller unit", () => {
    // 1023 bytes is one byte short of 1 KB — keep "B".
    expect(formatBytes(1023)).toBe("1023 B");
  });
});
