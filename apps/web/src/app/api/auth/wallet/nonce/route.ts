import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { db, authNonces } from "@/lib/db";
import { isWalletFamily, normalizeAddress } from "@/lib/auth/wallet-message";

const NONCE_TTL_MS = 10 * 60 * 1000;

/**
 * Issue a single-use sign-in nonce for a wallet address. Public — the nonce
 * is worthless without the wallet's signature, and it expires in 10 minutes.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { family, address } = (body ?? {}) as {
    family?: unknown;
    address?: unknown;
  };
  if (!isWalletFamily(family) || typeof address !== "string" || !address) {
    return NextResponse.json(
      { error: "Expected { family, address }" },
      { status: 400 },
    );
  }

  const nonce = randomBytes(24).toString("base64url");
  // Issued client-visible so the signed message and the server-side rebuild
  // use the identical timestamp string.
  const issuedAt = new Date();

  await db.insert(authNonces).values({
    nonce,
    family,
    address: normalizeAddress(family, address),
    createdAt: issuedAt,
    expiresAt: new Date(issuedAt.getTime() + NONCE_TTL_MS),
  });

  return NextResponse.json({ nonce, issuedAt: issuedAt.toISOString() });
}
