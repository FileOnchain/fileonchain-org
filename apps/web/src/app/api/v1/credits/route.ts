import { NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/server/api-keys";
import { getCreditBalance } from "@/lib/server/queries";
import { microToUsdc } from "@/lib/usdc";

/** Credit balance for programmatic checks. */
export async function GET(request: Request) {
  const apiKey = await authenticateApiKey(request);
  if (!apiKey) {
    return NextResponse.json({ error: "Invalid or revoked API key" }, { status: 401 });
  }
  const balance = await getCreditBalance(apiKey.userId);
  return NextResponse.json({
    balanceMicroUsdc: balance.toString(),
    balanceUsdc: microToUsdc(balance),
  });
}
