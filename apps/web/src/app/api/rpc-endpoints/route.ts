import { NextResponse } from "next/server";
import { getChain, type ChainId } from "@fileonchain/sdk";
import { requireUser, asRouteError } from "@/lib/auth";
import {
  getUserRpcOverrides,
  updateUserRpcOverrides,
} from "@/lib/server/rpc-endpoints";
import { logActivity } from "@/lib/server/activity";
import {
  MAX_RPC_OVERRIDES,
  isRpcConfigurableFamily,
  validateRpcUrl,
} from "@/lib/rpc-endpoints";

export async function GET() {
  try {
    const userId = await requireUser();
    const endpoints = await getUserRpcOverrides(userId);
    return NextResponse.json({ endpoints });
  } catch (error) {
    return asRouteError(error);
  }
}

/**
 * Validate an untrusted `{ endpoints }` body into a patch: string values
 * upsert (after URL validation), nulls delete. Returns an error string on
 * the first invalid entry.
 */
const parsePatch = (
  body: Record<string, unknown>,
): { patch: Partial<Record<ChainId, string | null>> } | { error: string } => {
  const raw = body.endpoints;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { error: "Expected an endpoints object" };
  }
  const entries = Object.entries(raw as Record<string, unknown>);
  if (entries.length === 0) {
    return { error: "No endpoints in body" };
  }

  const patch: Partial<Record<ChainId, string | null>> = {};
  for (const [chainId, value] of entries) {
    const chain = getChain(chainId as ChainId);
    if (!chain) return { error: `${chainId}: unknown chain` };
    if (value === null) {
      patch[chain.id] = null;
      continue;
    }
    if (typeof value !== "string") {
      return { error: `${chainId}: expected a URL string or null` };
    }
    if (!isRpcConfigurableFamily(chain.family)) {
      return { error: `${chainId}: this chain does not use a configurable RPC` };
    }
    const invalid = validateRpcUrl(chain.family, value);
    if (invalid) return { error: `${chainId}: ${invalid}` };
    patch[chain.id] = value.trim();
  }
  return { patch };
};

export async function PATCH(request: Request) {
  try {
    const userId = await requireUser();
    const body = (await request.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: "Expected a JSON object body" },
        { status: 400 },
      );
    }

    const parsed = parsePatch(body);
    if ("error" in parsed) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const upserted = Object.keys(parsed.patch).filter(
      (chainId) => parsed.patch[chainId as ChainId] !== null,
    );
    if (upserted.length > 0) {
      const existing = await getUserRpcOverrides(userId);
      const added = upserted.filter((id) => !(id in existing));
      if (Object.keys(existing).length + added.length > MAX_RPC_OVERRIDES) {
        return NextResponse.json(
          { error: `At most ${MAX_RPC_OVERRIDES} custom RPC endpoints per account` },
          { status: 400 },
        );
      }
    }

    const endpoints = await updateUserRpcOverrides(userId, parsed.patch);

    const removed = Object.keys(parsed.patch).filter(
      (chainId) => parsed.patch[chainId as ChainId] === null,
    );
    if (upserted.length > 0) {
      await logActivity(userId, "rpc_endpoint_updated", {
        chainIds: upserted.join(","),
      });
    }
    if (removed.length > 0) {
      await logActivity(userId, "rpc_endpoint_removed", {
        chainIds: removed.join(","),
      });
    }

    return NextResponse.json({ endpoints });
  } catch (error) {
    return asRouteError(error);
  }
}
