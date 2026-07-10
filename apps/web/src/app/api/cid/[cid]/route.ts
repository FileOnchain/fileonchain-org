import { NextResponse } from "next/server";
import { getCIDRecordsAcrossChains } from "@/lib/registry/reads";
import { isValidCID } from "@fileonchain/sdk";

/* TODO: replace with real resolver that streams the file from IPFS/IPLD */

interface RouteContext {
  params: Promise<{ cid: string }>;
}

export async function GET(_req: Request, { params }: RouteContext) {
  const { cid } = await params;

  if (!isValidCID(cid)) {
    return NextResponse.json(
      { error: "Invalid CID", cid },
      { status: 400 },
    );
  }

  const records = await getCIDRecordsAcrossChains(cid);

  return NextResponse.json({
    cid,
    found: records.length > 0,
    chains: records.map((r) => ({
      chainId: r.chainId,
      txHash: r.txHash,
      blockNumber: r.blockNumber,
      timestamp: r.timestamp,
      submitter: r.submitter,
    })),
  });
}