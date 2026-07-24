import "server-only";

/**
 * Deterministic envelope constructor for the Cloud smoke test. Produces
 * a byte-stable protocol envelope — same inputs, same bytes — so ops
 * can re-run the smoke against staging or prod and expect identical
 * digests, and the helper's invariants can be pinned in
 * `apps/web/test/cloud-smoke-envelope.test.ts`.
 *
 * The fixed ed25519 seed matches the reference happy-path test at
 * `packages/verify/test/sdk-e2e.test.ts:19` so the SDK + protocol
 * packages' canonical-JSON + signing semantics are exercised end-to-end
 * the same way the conformance suite does.
 *
 * No DB. No fetch. No env. Pure — runs in `pnpm --filter
 * @fileonchain/web test` without a server.
 */

import { ed25519 } from "@noble/curves/ed25519.js";
import {
  bytesToHex,
  type SignerIdentity,
} from "@fileonchain/protocol";
import {
  sealAgentRun,
  signEnvelope,
  storageReceipt,
  type EvidenceEnvelope,
  type EvidenceSigner,
  type AgentClaims,
} from "@fileonchain/sdk/evidence";

/** The 32-byte seed the smoke signer is derived from. Pinned so the
 *  helper's output is byte-stable across machines and Node versions. */
const SMOKE_ED25519_SEED: Uint8Array = new Uint8Array(32).fill(3);

/** The public key the smoke signer advertises, hex-encoded. Exported
 *  so the test (and any future re-derivation) can pin the identity. */
export const SMOKE_SIGNER_PUBLIC_KEY: string = bytesToHex(
  ed25519.getPublicKey(SMOKE_ED25519_SEED),
);

/** The identity the smoke signer claims. The protocol reports this
 *  verbatim in artifact + envelope signatures, so it is part of the
 *  envelope's canonical bytes and therefore part of the pin. */
export const SMOKE_SIGNER_IDENTITY: SignerIdentity = {
  kind: "agent",
  id: "agent://fileonchain-smoke",
  publicKey: SMOKE_SIGNER_PUBLIC_KEY,
  scheme: "ed25519",
  onBehalfOf: { kind: "organization", id: "smoke.example.org" },
};

/** A pinned signing time, recorded on every signature the smoke emits.
 *  Using a fixed value makes the envelope byte-deterministic regardless
 *  of when the smoke runs. */
const SMOKE_SIGNED_AT = "2026-07-24T00:00:00Z";

/** A pinned createdAt, also part of the canonical envelope. */
const SMOKE_CREATED_AT = "2026-07-24T00:00:00Z";

/** Default subject bytes: a fixed 36-byte string. Deterministic sha256. */
const SMOKE_SUBJECT_BYTES: Uint8Array = new TextEncoder().encode(
  "fileonchain-cloud-smoke: deterministic subject",
);

/** Default Agent Evidence Profile claims. `runId` and `agentId` are the
 *  only unconditionally required fields after validation. */
const SMOKE_DEFAULT_RUN: AgentClaims = {
  runId: "smoke-run-0",
  agentId: "fileonchain-smoke",
  status: "completed",
};

/** The smoke signer. Signs the canonical payload string with the fixed
 *  ed25519 seed and returns a hex signature — the same contract
 *  `EvidenceSigner.sign` requires. */
const smokeSigner: EvidenceSigner = {
  signer: SMOKE_SIGNER_IDENTITY,
  sign: (payload) =>
    bytesToHex(
      ed25519.sign(new TextEncoder().encode(payload), SMOKE_ED25519_SEED),
    ),
  signedAt: SMOKE_SIGNED_AT,
};

/** Build a deterministic, sealed, envelope-signed Agent Evidence
 *  Profile envelope suitable for a Cloud smoke round-trip.
 *
 *  The envelope has:
 *    - one artifact signature over the subject + agent claims
 *    - one envelope signature over the envelope digest
 *    - one `storageReceipt({ mode: "evidence-only" })` (so the storage
 *      check returns `pass`, not `unknown`)
 *    - no settlement receipts (the smoke targets the ingest path, not
 *      the chain-anchor path)
 *
 *  The signer is a smoke-only test identity (`agent://fileonchain-smoke`)
 *  that must never appear in production envelopes. The seed is fixed;
 *  if it is ever reused outside the smoke, the test fails loudly.
 */
export const buildCloudSmokeEnvelope = async (
  subjectBytes: Uint8Array = SMOKE_SUBJECT_BYTES,
  opts: { run?: AgentClaims } = {},
): Promise<EvidenceEnvelope> => {
  const run = opts.run ?? SMOKE_DEFAULT_RUN;
  const envelope = await sealAgentRun({
    subjectBytes,
    subjectMeta: {
      name: "cloud-smoke-subject.txt",
      mediaType: "text/plain",
    },
    run,
    signers: [smokeSigner],
    receipts: {
      storage: [storageReceipt({ mode: "evidence-only" })],
    },
    createdAt: SMOKE_CREATED_AT,
  });
  return signEnvelope(envelope, [smokeSigner]);
};

/** The default subject bytes the helper uses when none are passed.
 *  Exported so the smoke script (and its test) can compute the
 *  expected subject sha256 + size for round-trip assertions. */
export const SMOKE_DEFAULT_SUBJECT_BYTES: Uint8Array = SMOKE_SUBJECT_BYTES;
