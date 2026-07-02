import { NextResponse } from "next/server";
import { isValidCID } from "@/lib/cid/validate";

/* TODO: replace with real file-content lookup from IPFS/IPLD storage */

interface RouteContext {
  params: Promise<{ cid: string }>;
}

export async function GET(_req: Request, { params }: RouteContext) {
  const { cid } = await params;

  if (!isValidCID(cid)) {
    return NextResponse.json({ found: false }, { status: 400 });
  }

  // Mock: every valid CID is "found" for now.
  return NextResponse.json({ found: true });
}