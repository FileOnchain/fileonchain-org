import type { ChainId } from "@fileonchain/utils";
import type { EvidenceEnvelope, VerificationReport } from "@fileonchain/verify";

/**
 * @fileonchain/api — typed client for the hosted FileOnChain HTTP API.
 *
 * Anchoring through the API spends account credits (or a BYOK key) and the
 * FileOnChain workers sign the transactions, so no wallet or chain SDK is
 * needed here — for self-signed anchoring use the `@fileonchain/sdk-*`
 * family clients instead. Authentication is an API key from the dashboard
 * (`fok_…`), sent as `Authorization: Bearer`. Uses the global `fetch`
 * (Node >= 18 or any browser).
 *
 * The Cloud evidence surface (`/api/v1/evidence`, `/api/v1/agent-runs`,
 * `/api/v1/verify`, `/api/v1/retention`) is gated server-side by the
 * `FILEONCHAIN_CLOUD_EVIDENCE_ENABLED` env var. When OFF, those routes
 * return 503 and the methods below throw `FileOnChainApiError(503, …)`.
 * The Cloud evidence surface requires an org-scoped API key.
 */

export const DEFAULT_BASE_URL = "https://fileonchain.org";

export interface FileOnChainClientOptions {
  /** Dashboard API key, `fok_…`. */
  apiKey: string;
  /** Origin of the API deployment; defaults to https://fileonchain.org. */
  baseUrl?: string;
  /** Override the fetch implementation (tests, custom agents). */
  fetch?: typeof fetch;
}

/** Non-2xx response from the API; `body.error` carries the server message. */
export class FileOnChainApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: { error?: string } | null,
    endpoint: string,
  ) {
    super(`FileOnChain API ${endpoint} failed with ${status}: ${body?.error ?? "unknown error"}`);
    this.name = "FileOnChainApiError";
  }
}

export type AnchorJobStatus = "pending" | "anchoring" | "complete" | "failed";
export type AnchorPaymentMethod = "credits" | "byok";

/** One transaction sent for a job — one entry per anchored chain. */
export interface AnchorJobTx {
  chainId: ChainId;
  txHash: string;
  blockNumber: number;
}

/** The job shape returned by POST /api/v1/anchor and GET /api/v1/anchor/{id}. */
export interface AnchorJob {
  id: string;
  cid: string;
  fileName: string;
  fileSizeBytes: number;
  chunkCount: number;
  chainIds: ChainId[];
  paymentMethod: AnchorPaymentMethod;
  status: AnchorJobStatus;
  /** Bigint micro-USDC serialized as a string. */
  costMicroUsdc: string;
  txHashes: AnchorJobTx[];
  /** ISO timestamp. */
  createdAt: string;
  /** ISO timestamp, null until the job finishes. */
  completedAt: string | null;
}

export interface AnchorRequest {
  /** CIDv1 base32 of the file (or folder DAG root). */
  cid: string;
  fileName: string;
  /** Positive integer byte size. */
  fileSizeBytes: number;
  /** 1–100000. */
  chunkCount: number;
  /** Chains to anchor on, e.g. ["substrate:autonomys-mainnet"]. */
  chainIds: ChainId[];
  /** Defaults to "credits" server-side rules; pass "byok" with byokKeyId. */
  paymentMethod: AnchorPaymentMethod;
  /** Required when paymentMethod is "byok". */
  byokKeyId?: string;
  /**
   * Platform id to attribute the anchor to in the payload (numeric string);
   * defaults to FileOnChain's platform.
   */
  platformId?: string;
}

export interface CreditBalance {
  /** Bigint micro-USDC serialized as a string. */
  balanceMicroUsdc: string;
  balanceUsdc: number;
}

export interface WaitForJobOptions {
  /** Delay between polls; default 2000 ms. */
  pollIntervalMs?: number;
  /** Give up (throwing) after this long; default 120000 ms. */
  timeoutMs?: number;
  signal?: AbortSignal;
}

/* ------------------------------------------------------------------ */
/* Cloud evidence surface types                                        */
/* ------------------------------------------------------------------ */

/** Result of `POST /api/v1/evidence`. */
export interface SubmitEvidenceResult {
  envelopeId: string;
  envelope: EvidenceEnvelope;
  /** Server-computed envelope digest (SHA-256 lowercase hex). */
  envelopeDigest: string;
}

/** Result of `GET /api/v1/evidence/:id`. */
export interface EvidenceEnvelopeRecord {
  envelopeId: string;
  envelope: EvidenceEnvelope;
  envelopeDigest: string;
  profile: string | null;
  subjectSha256: string | null;
  /** ISO timestamp. */
  createdAt: string;
  /** ISO timestamp, null when no retention policy is in force. */
  expiresAt: string | null;
  verificationCount: number;
}

/** One hit returned by `GET /api/v1/evidence?query=…`. */
export interface EvidenceSearchHit {
  envelopeId: string;
  envelopeDigest: string;
  profile: string | null;
  subjectSha256: string | null;
  /** ISO timestamp. */
  createdAt: string;
  /** `<b>…</b>`-highlighted snippet (server-side ts_headline). */
  snippet: string;
}

/** Result of `POST /api/v1/agent-runs`. */
export interface SubmitAgentRunResult {
  runId: string;
  agentId: string;
  envelopeId: string;
}

/** One envelope in a run-centric GET. */
export interface AgentRunEnvelope {
  envelopeId: string;
  envelopeDigest: string;
  profile: string | null;
  subjectSha256: string | null;
  /** ISO timestamp. */
  createdAt: string;
}

/** Result of `GET /api/v1/agent-runs/:runId`. */
export interface AgentRunRecord {
  runId: string;
  agentId: string;
  envelopes: AgentRunEnvelope[];
}

/** Body shape for `POST /api/v1/verify` — case A. */
export interface ServerVerifyByEnvelopeId {
  envelopeId: string;
  /** Optional base64-encoded subject bytes; recomputes the subject digest. */
  subjectBytesB64?: string;
  /** When true, the verifier consults public RPCs for receipt checks. */
  checkReceiptsOnline?: boolean;
}

/** Body shape for `POST /api/v1/verify` — case B. */
export interface ServerVerifyByEnvelope {
  envelope: EvidenceEnvelope;
  subjectBytesB64?: string;
  checkReceiptsOnline?: boolean;
}

/** Discriminated union for `POST /api/v1/verify`. */
export type ServerVerifyBody = ServerVerifyByEnvelopeId | ServerVerifyByEnvelope;

/** Result of `GET` / `PATCH /api/v1/retention`. */
export interface RetentionPolicy {
  /** Days from `created_at` before the envelope is swept. */
  windowDays: number;
  /** Where the window came from — `policy` (custom) or `default` (hard-coded). */
  source: "policy" | "default";
}

const sleep = (ms: number, signal?: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason instanceof Error ? signal.reason : new Error("Aborted"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });

export class FileOnChainClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor({ apiKey, baseUrl = DEFAULT_BASE_URL, fetch: fetchImpl }: FileOnChainClientOptions) {
    if (!apiKey) throw new Error("An API key is required (create one in the dashboard).");
    this.apiKey = apiKey;
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.fetchImpl = fetchImpl ?? fetch;
  }

  private async request<T>(
    endpoint: string,
    init?: { method?: string; body?: unknown; signal?: AbortSignal },
  ): Promise<T> {
    const response = await this.fetchImpl(`${this.baseUrl}${endpoint}`, {
      method: init?.method ?? "GET",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        ...(init?.body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: init?.signal,
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      throw new FileOnChainApiError(response.status, body, endpoint);
    }
    return (await response.json()) as T;
  }

  /**
   * Anchor a CID on one or more chains. Anchoring runs within the request,
   * so a 200 means the returned job is already "complete"; failures surface
   * as FileOnChainApiError (402 insufficient credits, 502 send failed with
   * credits refunded, …).
   */
  async anchor(request: AnchorRequest, options?: { signal?: AbortSignal }): Promise<AnchorJob> {
    const { job } = await this.request<{ job: AnchorJob }>("/api/v1/anchor", {
      method: "POST",
      body: request,
      signal: options?.signal,
    });
    return job;
  }

  /** Fetch one anchor job owned by the API key's account. */
  async getJob(id: string, options?: { signal?: AbortSignal }): Promise<AnchorJob> {
    const { job } = await this.request<{ job: AnchorJob }>(
      `/api/v1/anchor/${encodeURIComponent(id)}`,
      { signal: options?.signal },
    );
    return job;
  }

  /** Poll a job until it leaves "pending"/"anchoring" or the timeout hits. */
  async waitForJob(
    id: string,
    { pollIntervalMs = 2_000, timeoutMs = 120_000, signal }: WaitForJobOptions = {},
  ): Promise<AnchorJob> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const job = await this.getJob(id, { signal });
      if (job.status === "complete" || job.status === "failed") return job;
      if (Date.now() + pollIntervalMs > deadline) {
        throw new Error(`Timed out after ${timeoutMs} ms waiting for anchor job "${id}".`);
      }
      await sleep(pollIntervalMs, signal);
    }
  }

  /** Current credit balance in micro-USDC (string) and USDC (number). */
  getCredits(options?: { signal?: AbortSignal }): Promise<CreditBalance> {
    return this.request<CreditBalance>("/api/v1/credits", { signal: options?.signal });
  }

  /* ------------------------------------------------------------------ */
  /* Cloud evidence surface (org-scoped, gated behind                   */
  /* FILEONCHAIN_CLOUD_EVIDENCE_ENABLED on the server).                  */
  /* ------------------------------------------------------------------ */

  /**
   * Submit a sealed envelope. Hash-only by default — the body carries an
   * `EvidenceEnvelope` JSON, never the artifact bytes. The server
   * recomputes the envelope digest and stamps `expires_at` from the
   * org's retention policy.
   *
   * Requires an org-scoped API key. 403 `org_scoped_key_required` for
   * personal keys.
   */
  submitEvidence(
    input: { envelope: EvidenceEnvelope },
    options?: { signal?: AbortSignal },
  ): Promise<SubmitEvidenceResult> {
    return this.request<SubmitEvidenceResult>("/api/v1/evidence", {
      method: "POST",
      body: input,
      signal: options?.signal,
    });
  }

  /** Fetch one sealed envelope by id. 404 when the envelope is not in the
   *  caller's org. */
  getEvidence(envelopeId: string, options?: { signal?: AbortSignal }): Promise<EvidenceEnvelopeRecord> {
    return this.request<EvidenceEnvelopeRecord>(
      `/api/v1/evidence/${encodeURIComponent(envelopeId)}`,
      { signal: options?.signal },
    );
  }

  /** Claim-level + signer search across the org's envelopes. Empty query
   *  returns the most recent rows. */
  searchEvidence(
    params: { query?: string; limit?: number },
    options?: { signal?: AbortSignal },
  ): Promise<{ hits: EvidenceSearchHit[] }> {
    const search = new URLSearchParams();
    if (params.query) search.set("query", params.query);
    if (params.limit !== undefined) search.set("limit", String(params.limit));
    const qs = search.toString();
    return this.request<{ hits: EvidenceSearchHit[] }>(
      `/api/v1/evidence${qs ? `?${qs}` : ""}`,
      { signal: options?.signal },
    );
  }

  /** Submit an Agent Evidence envelope. Must carry the
   *  `org.fileonchain.agent/v1` profile and required `runId` / `agentId`
   *  claims. */
  submitAgentRun(
    input: { envelope: EvidenceEnvelope },
    options?: { signal?: AbortSignal },
  ): Promise<SubmitAgentRunResult> {
    return this.request<SubmitAgentRunResult>("/api/v1/agent-runs", {
      method: "POST",
      body: input,
      signal: options?.signal,
    });
  }

  /** Run-centric view: returns the run plus the envelopes sealed under it. */
  getAgentRun(runId: string, options?: { signal?: AbortSignal }): Promise<AgentRunRecord> {
    return this.request<AgentRunRecord>(
      `/api/v1/agent-runs/${encodeURIComponent(runId)}`,
      { signal: options?.signal },
    );
  }

  /** Run the open verifier server-side. Accepts either an envelope id
   *  (case A — server fetches + verifies + bumps counters) or an envelope
   *  payload (case B — caller supplies, no DB lookup). The response is
   *  the same `VerificationReport` shape as `@fileonchain/verify`. */
  runServerVerify(
    body: ServerVerifyBody,
    options?: { signal?: AbortSignal },
  ): Promise<VerificationReport> {
    return this.request<VerificationReport>("/api/v1/verify", {
      method: "POST",
      body,
      signal: options?.signal,
    });
  }

  /** Effective retention window for the caller's org. */
  getRetention(options?: { signal?: AbortSignal }): Promise<RetentionPolicy> {
    return this.request<RetentionPolicy>("/api/v1/retention", {
      signal: options?.signal,
    });
  }

  /** Upsert the per-org retention window (positive integer days). */
  setRetentionPolicy(
    windowDays: number,
    options?: { signal?: AbortSignal },
  ): Promise<RetentionPolicy> {
    return this.request<RetentionPolicy>("/api/v1/retention", {
      method: "PATCH",
      body: { windowDays },
      signal: options?.signal,
    });
  }
}
