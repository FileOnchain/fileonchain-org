import type { ChainId } from "@fileonchain/utils";

/**
 * @fileonchain/api — typed client for the hosted FileOnChain HTTP API.
 *
 * Anchoring through the API spends account credits (or a BYOK key) and the
 * FileOnChain workers sign the transactions, so no wallet or chain SDK is
 * needed here — for self-signed anchoring use the `@fileonchain/sdk-*`
 * family clients instead. Authentication is an API key from the dashboard
 * (`fok_…`), sent as `Authorization: Bearer`. Uses the global `fetch`
 * (Node >= 18 or any browser).
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

/**
 * On-chain propose/verify lifecycle of the file anchor, tracked separately
 * from the job status: the job completes when the propose transaction
 * lands; verification settles after the challenge window. "none" means the
 * anchor rode a memo-only chain (or a mock) with no protocol attached.
 */
export type AnchorVerificationStatus =
  | "none"
  | "proposed"
  | "challenged"
  | "verified"
  | "rejected";

/** One transaction sent for a job — one entry per anchored chain. */
export interface AnchorJobTx {
  chainId: ChainId;
  txHash: string;
  blockNumber: number;
  /** Registry proposal id, when the anchor went through proposeAnchor. */
  proposalId?: string;
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
  verification: {
    status: AnchorVerificationStatus;
    /** ISO timestamp of the challenge-window close; null when not proposed. */
    challengeDeadline: string | null;
    /** Platform the anchor was attributed to; null when not proposed. */
    platformId: string | null;
  };
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
   * Registered platform id to attribute the anchor to (numeric string).
   * Registered integrators pass their own id to receive the platform share
   * of the verification fee split; defaults to FileOnChain's platform.
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
}
