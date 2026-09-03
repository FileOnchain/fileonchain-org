import { NextResponse } from "next/server";
import { getCostEstimates } from "@/lib/server/costs";

export const dynamic = "force-dynamic";

/**
 * `GET /api/costs` — per-chain anchoring cost estimates, live where
 * quotable (EVM estimateGas × gas price, substrate paymentInfo, Solana
 * fee-per-signature, CoinGecko USD prices) and seed elsewhere. Each row
 * carries `source: "seed" | "live"` so the UI can tell the difference.
 *
 * Public on purpose — anchoring pricing is chain-defined, not user
 * state, and the upload screen renders for logged-out visitors too.
 * `getCostEstimates` never throws (worst case is the pure seed table),
 * so this route always answers 200 with a usable table.
 */
export async function GET() {
  const estimates = await getCostEstimates();
  return NextResponse.json({ estimates, updatedAt: new Date().toISOString() });
}
