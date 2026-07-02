import { NextResponse } from "next/server";

/* TODO: persist upload metadata to a real indexer / database */

interface UploadFallbackBody {
  network: string;
  cidList: { cid: string; nextCid?: string }[];
  hash: string;
  blockNumber: number;
}

export async function POST(req: Request) {
  let body: Partial<UploadFallbackBody> = {};
  try {
    body = (await req.json()) as UploadFallbackBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.network || !Array.isArray(body.cidList)) {
    return NextResponse.json(
      { ok: false, error: "Missing network or cidList" },
      { status: 400 },
    );
  }

  return NextResponse.json({ ok: true, indexed: body.cidList.length });
}