import "server-only";
import { parseAnchorPayload, type CIDRegistryRecord, type ChainConfig } from "@fileonchain/sdk";

/**
 * Resolve a CID to a Substrate `CIDRegistryRecord` via the chain's public
 * Subscan / explorer mirror API.
 *
 * Substrate has no native JSON-RPC method for "fetch extrinsic by hash",
 * and no on-chain registry storage — the FileOnChain anchor lives inside
 * a `system.remarkWithEvent` extrinsic whose remark string is the JSON
 * anchor payload. To resolve a CID we ask the mirror for recent
 * `system.remark` extrinsics and filter by parsing each remark against
 * `parseAnchorPayload`.
 *
 * Important: the public Subscan endpoint rejects unauthenticated
 * requests with 403, and chains without a free mirror return an empty
 * `data.list`. Both cases resolve to `null` so callers fall back to the
 * mock. The mirror URL is configured per-chain in `ChainConfig` —
 * Subscan-backed asset hubs leave it unset until a `SUBSCAN_API_KEY`
 * is provisioned.
 *
 * Auth: `SUBSCAN_API_KEY` env var, sent as `X-API-Key`, gates the
 * Subscan backend. Absent = unauthenticated call (Autonomys explorer
 * accepts it; Subscan returns 403, which we treat as "no result").
 */

const MIRROR_LOOKBACK_ROWS = 200;
const MIRROR_TIMEOUT_MS = 8_000;

interface MirrorExtrinsic {
  hash?: string;
  extrinsic_hash?: string;
  block_timestamp?: number;
  block_num?: number;
  account?: string;
  call_module_function?: string;
  /** Subscan nests the call args under params; some mirrors surface them
   *  on the top level. We accept both. */
  params?: unknown;
  call_args?: unknown;
  data?: { call_args?: unknown; params?: unknown };
}

interface MirrorResponse {
  code?: number;
  message?: string;
  data?: { list?: MirrorExtrinsic[] };
  list?: MirrorExtrinsic[];
}

/** Extract the first string field from a Subscan-style call-arg array.
 *  Subscan represents `system.remark(remark: Bytes)` as one Vec<Bytes> arg. */
const firstStringArg = (args: unknown): string | null => {
  if (!Array.isArray(args)) return null;
  for (const arg of args) {
    if (typeof arg === "string" && arg.length > 0) return arg;
    if (arg && typeof arg === "object") {
      const value = (arg as { value?: unknown }).value;
      if (typeof value === "string" && value.length > 0) return value;
    }
  }
  return null;
};

const findRemarkString = (row: MirrorExtrinsic): string | null => {
  const candidates: unknown[] = [
    row.params,
    row.call_args,
    row.data?.params,
    row.data?.call_args,
  ];
  for (const candidate of candidates) {
    const remark = firstStringArg(candidate);
    if (remark) return remark;
  }
  return null;
};

/**
 * Query the chain's mirror for the most recent `system.remark`
 * extrinsics, return the first one whose remark JSON contains the CID.
 *
 * Autonomys's explorer mirror exposes a slightly different shape than
 * Subscan; the function handles both, returning the first matching row.
 */
export const readSubstrateRecordViaMirror = async (
  chain: ChainConfig,
  cid: string,
): Promise<CIDRegistryRecord | null> => {
  const mirror = chain.mirrorApiUrl;
  if (!mirror) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), MIRROR_TIMEOUT_MS);
  try {
    const res = await fetch(`${mirror}/api/scan/extrinsics`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.SUBSCAN_API_KEY
          ? { "X-API-Key": process.env.SUBSCAN_API_KEY }
          : {}),
      },
      body: JSON.stringify({
        row: MIRROR_LOOKBACK_ROWS,
        page: 0,
        module: "system",
        call: "remark",
      }),
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) return null;

    const body = (await res.json().catch(() => null)) as MirrorResponse | null;
    const rows = body?.data?.list ?? body?.list ?? [];
    for (const row of rows) {
      const remark = findRemarkString(row);
      if (!remark) continue;
      const payload = parseAnchorPayload(remark);
      if (!payload) continue;
      if (payload.cid !== cid) continue;
      // `sha256` lives on the file-level anchor payload only; chunk
      // payloads carry the per-chunk bytes instead.
      const contentHash =
        payload.op === "anchor" && payload.sha256 ? payload.sha256 : "";
      const uri = payload.op === "anchor" && payload.uri ? payload.uri : "";
      const submitter =
        row.account ?? "0x0000000000000000000000000000000000000000";
      const blockNumber = row.block_num;
      const timestamp =
        row.block_timestamp ?? Math.floor(Date.now() / 1000);
      const txHash = row.extrinsic_hash ?? row.hash;
      return {
        cid,
        chainId: chain.id,
        // Substrate has no on-chain registry contract; surface the
        // pallet capability marker so consumers don't render a fake EVM
        // address.
        registryAddress:
          `0x0000000000000000000000000000000000000000` as `0x${string}`,
        txHash,
        blockNumber,
        timestamp: Number(timestamp),
        submitter,
        contentHash,
        uri,
        status: "anchored",
      };
    }
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
};
