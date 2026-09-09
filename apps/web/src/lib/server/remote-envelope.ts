import "server-only";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { parseEnvelope, type EvidenceEnvelope } from "@fileonchain/sdk/protocol";
import type { VerificationReport } from "@fileonchain/verify";
import { decodeEnvelopeParam, parseRemoteEnvelopeUrl } from "@/lib/verify/samples";
import { summarizeReport, type ReportSummary } from "@/lib/verify/summary";
import type { BadgeStatus } from "@/lib/verify/badge";

/**
 * Server-side loading + verification of an envelope named by URL — the
 * engine behind `GET /api/badge` and `GET /api/og/verify`, which have
 * to produce an image without a browser in the loop.
 *
 * Two inputs, mirroring `/verify`'s own link parameters:
 *  - `url=<https://…>`  the server fetches the envelope JSON;
 *  - `envelope=<b64url>` the envelope rides inline (small ones only).
 *
 * Fetching arbitrary URLs from the server is a server-side request
 * forgery surface, so the fetch is fenced: http(s) only, every hop of a
 * redirect chain is resolved through DNS and rejected unless every
 * address is publicly routable, responses are capped in size and time.
 * The verifier runs offline (structural receipt checks) — the badge and
 * card say what the local verifier says, and nothing more.
 */

export const MAX_ENVELOPE_BYTES = 1_048_576; // 1 MiB — envelopes are hash-only, this is generous.
export const FETCH_TIMEOUT_MS = 8_000;
const MAX_REDIRECTS = 5;

/* ------------------------------------------------------------------ */
/* Public-address fence                                                */
/* ------------------------------------------------------------------ */

const parseV4 = (ip: string): number[] | null => {
  const parts = ip.split(".").map(Number);
  return parts.length === 4 && parts.every((n) => Number.isInteger(n) && n >= 0 && n <= 255)
    ? parts
    : null;
};

/** Is an IPv4 address publicly routable (not loopback/private/link-local/etc.)? */
const isPublicV4 = (ip: string): boolean => {
  const p = parseV4(ip);
  if (!p) return false;
  const [a, b] = p;
  if (a === 0 || a === 10 || a === 127) return false; // "this", private, loopback
  if (a === 100 && b >= 64 && b <= 127) return false; // CGNAT
  if (a === 169 && b === 254) return false; // link-local (cloud metadata lives here)
  if (a === 172 && b >= 16 && b <= 31) return false; // private
  if (a === 192 && b === 168) return false; // private
  if (a === 192 && b === 0 && p[2] === 0) return false; // IETF protocol assignments
  if (a === 198 && (b === 18 || b === 19)) return false; // benchmarking
  if (a >= 224) return false; // multicast + reserved + broadcast
  return true;
};

/** Is an IPv6 address publicly routable? Handles IPv4-mapped forms. */
const isPublicV6 = (ip: string): boolean => {
  const lower = ip.toLowerCase();
  const mapped = lower.match(/^(?:0*:)*ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPublicV4(mapped[1]);
  if (lower === "::" || lower === "::1") return false;
  if (/^fe[89ab]/.test(lower)) return false; // link-local fe80::/10
  if (/^f[cd]/.test(lower)) return false; // unique local fc00::/7
  if (lower.startsWith("ff")) return false; // multicast
  if (lower.startsWith("::")) return false; // IPv4-compatible / deprecated
  if (lower.startsWith("2001:db8")) return false; // documentation
  return true;
};

/** Is an IP literal publicly routable? Unknown/invalid → false. */
export const isPublicAddress = (ip: string): boolean => {
  const version = isIP(ip);
  if (version === 4) return isPublicV4(ip);
  if (version === 6) return isPublicV6(ip);
  return false;
};

/**
 * Hostname-level rejections that need no DNS: loopback names and the
 * reserved local-only TLDs. Everything else is decided by resolving it.
 */
export const isForbiddenHostname = (hostname: string): boolean => {
  const h = hostname.toLowerCase().replace(/\.$/, "");
  if (h === "localhost" || h.endsWith(".localhost")) return true;
  if (h.endsWith(".local") || h.endsWith(".internal") || h.endsWith(".home.arpa")) return true;
  const literal = h.startsWith("[") && h.endsWith("]") ? h.slice(1, -1) : h;
  if (isIP(literal)) return !isPublicAddress(literal);
  return false;
};

/** Resolve a hostname and require every address to be public. */
const assertPublicHost = async (hostname: string): Promise<void> => {
  if (isForbiddenHostname(hostname)) throw new RemoteEnvelopeError("unreachable", "host is not public");
  const literal = hostname.startsWith("[") ? hostname.slice(1, -1) : hostname;
  if (isIP(literal)) return; // already vetted by isForbiddenHostname
  let addresses: { address: string }[];
  try {
    addresses = await lookup(hostname, { all: true });
  } catch {
    throw new RemoteEnvelopeError("unreachable", "host does not resolve");
  }
  if (addresses.length === 0 || !addresses.every((a) => isPublicAddress(a.address))) {
    throw new RemoteEnvelopeError("unreachable", "host resolves to a non-public address");
  }
};

/* ------------------------------------------------------------------ */
/* Fetch                                                               */
/* ------------------------------------------------------------------ */

export class RemoteEnvelopeError extends Error {
  constructor(
    /** Which non-result badge to show. */
    public readonly badge: Extract<BadgeStatus, "unknown" | "unreachable">,
    message: string,
  ) {
    super(message);
    this.name = "RemoteEnvelopeError";
  }
}

/** Read a body up to `MAX_ENVELOPE_BYTES`; throws when the cap is exceeded. */
const readCapped = async (res: Response): Promise<string> => {
  const declared = Number(res.headers.get("content-length") ?? "0");
  if (declared > MAX_ENVELOPE_BYTES) throw new RemoteEnvelopeError("unreachable", "envelope too large");
  const reader = res.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_ENVELOPE_BYTES) {
      await reader.cancel();
      throw new RemoteEnvelopeError("unreachable", "envelope too large");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    bytes.set(c, offset);
    offset += c.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
};

/**
 * Fetch envelope JSON from a public http(s) URL, following at most five
 * redirects and vetting each hop. Returns the body text.
 */
export const fetchRemoteEnvelope = async (
  input: URL,
  fetchImpl: typeof fetch = fetch,
): Promise<string> => {
  let current = input;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    if (current.protocol !== "https:" && current.protocol !== "http:") {
      throw new RemoteEnvelopeError("unreachable", "only http(s) URLs are fetched");
    }
    await assertPublicHost(current.hostname);
    let res: Response;
    try {
      res = await fetchImpl(current, {
        redirect: "manual",
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: { accept: "application/json, text/plain;q=0.9, */*;q=0.1" },
      });
    } catch {
      throw new RemoteEnvelopeError("unreachable", "fetch failed");
    }
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) throw new RemoteEnvelopeError("unreachable", "redirect without location");
      current = new URL(location, current);
      continue;
    }
    if (!res.ok) throw new RemoteEnvelopeError("unreachable", `HTTP ${res.status}`);
    try {
      return await readCapped(res);
    } catch (err) {
      if (err instanceof RemoteEnvelopeError) throw err;
      throw new RemoteEnvelopeError("unreachable", "body is not UTF-8 text");
    }
  }
  throw new RemoteEnvelopeError("unreachable", "too many redirects");
};

/* ------------------------------------------------------------------ */
/* Input + verification                                                */
/* ------------------------------------------------------------------ */

export type EnvelopeInput = { kind: "url"; url: URL } | { kind: "inline"; json: string };

/**
 * Read `url=` / `envelope=` from a request's query. `envelope=` also
 * accepts an http(s) URL so `?envelope=<url>` works the way the issue
 * tracker spelt it. Throws `unknown` when neither is usable.
 */
export const resolveEnvelopeInput = (params: URLSearchParams): EnvelopeInput => {
  const url = params.get("url");
  const envelope = params.get("envelope");
  const remote = parseRemoteEnvelopeUrl(url ?? envelope ?? "");
  if (remote) return { kind: "url", url: remote };
  if (envelope) {
    try {
      return { kind: "inline", json: decodeEnvelopeParam(envelope) };
    } catch {
      throw new RemoteEnvelopeError("unknown", "envelope parameter is not base64url JSON");
    }
  }
  throw new RemoteEnvelopeError("unknown", "missing url or envelope parameter");
};

export interface RemoteVerification {
  input: EnvelopeInput;
  /** Parsed protocol envelope; null for a legacy-evidence-v1 package. */
  envelope: EvidenceEnvelope | null;
  report: VerificationReport;
  summary: ReportSummary;
}

/**
 * Load the envelope named by the query and run the offline verifier on
 * it. Throws `RemoteEnvelopeError` for anything that is not a verifier
 * result, so callers can render the matching non-result badge.
 */
export const verifyRemoteEnvelope = async (
  params: URLSearchParams,
  fetchImpl: typeof fetch = fetch,
): Promise<RemoteVerification> => {
  const input = resolveEnvelopeInput(params);
  const json = input.kind === "url" ? await fetchRemoteEnvelope(input.url, fetchImpl) : input.json;
  const { verifyEvidenceJson } = await import("@fileonchain/verify");
  const report = await verifyEvidenceJson(json, { checkReceiptsOnline: false });
  const envelope = parseEnvelope(json);
  return { input, envelope, report, summary: summarizeReport(envelope, report) };
};
