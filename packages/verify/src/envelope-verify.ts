import {
  artifactSigningPayload,
  computeEnvelopeDigest,
  envelopeSigningPayload,
  envelopeSigningPayloadDigest,
  getAdapter,
  getProfile,
  sha256Hex,
  sha256HexUtf8,
  validateEnvelope,
  type EvidenceEnvelope,
  type Receipt,
} from "@fileonchain/protocol";
import { summarize, type CheckGroup, type CheckResult, type VerificationReport } from "./report";
import { verifySchemeSignature } from "./signatures";

/**
 * Deterministic local verification of a protocol evidence envelope.
 *
 * Everything here runs without calling any FileOnChain service. Offline
 * checks are fully deterministic; the optional online pass confirms
 * receipts against public endpoints chosen by the verifier.
 *
 * The report separates what the PRD requires it to separate: subject
 * integrity, artifact signatures (who signed the subject and claims),
 * claimed identities and delegations, envelope signatures (who assembled
 * this complete envelope), receipts per kind, key status, and unknowns —
 * with an overall status that never collapses uncertainty into a single
 * green light.
 */

export interface VerifyEnvelopeOptions {
  /** Raw subject bytes; enables the subject-integrity checks. */
  subjectBytes?: Uint8Array;
  /** Confirm receipts online through their adapters (off by default). */
  checkReceiptsOnline?: boolean;
  /** Endpoint overrides per system identifier, passed to adapters. */
  endpoints?: Record<string, string>;
}

const RECEIPT_GROUPS: Record<Receipt["type"], CheckGroup> = {
  storage: "storage-receipts",
  settlement: "settlement-receipts",
  inclusion: "inclusion-receipts",
};

export const verifyEnvelope = async (
  envelope: EvidenceEnvelope,
  options: VerifyEnvelopeOptions = {},
): Promise<VerificationReport> => {
  const checks: CheckResult[] = [];
  let incomplete = false;

  // 1. Schema.
  const schemaErrors = validateEnvelope(envelope);
  if (schemaErrors.length > 0) {
    checks.push({
      name: "schema",
      group: "schema",
      status: "fail",
      detail: schemaErrors.join("; "),
    });
    return summarize(checks, incomplete);
  }
  checks.push({
    name: "schema",
    group: "schema",
    status: "pass",
    detail: `evidence envelope v${envelope.version}${envelope.profile ? ` · profile ${envelope.profile}` : ""}`,
  });

  // 2. Subject integrity.
  if (options.subjectBytes) {
    const digest = sha256Hex(options.subjectBytes);
    const expected = envelope.subject.digests?.sha256;
    if (!expected) {
      checks.push({
        name: "subject-sha256",
        group: "subject",
        status: "warning",
        detail: "bytes provided but the subject carries no sha256 digest to compare",
      });
    } else {
      checks.push(
        digest === expected
          ? { name: "subject-sha256", group: "subject", status: "pass", detail: `sha256 ${digest} matches` }
          : {
              name: "subject-sha256",
              group: "subject",
              status: "fail",
              detail: `bytes hash to ${digest}, envelope says ${expected}`,
            },
      );
    }
    if (envelope.subject.size !== undefined && envelope.subject.size !== options.subjectBytes.length) {
      checks.push({
        name: "subject-size",
        group: "subject",
        status: "fail",
        detail: `bytes are ${options.subjectBytes.length} long, envelope says ${envelope.subject.size}`,
      });
    }
  } else if (envelope.subject.digests?.sha256) {
    checks.push({
      name: "subject-sha256",
      group: "subject",
      status: "skipped",
      detail: "no subject bytes provided — integrity not checked",
    });
  } else {
    checks.push({
      name: "subject-identity",
      group: "subject",
      status: "warning",
      detail: `subject identified by ${envelope.subject.uri ?? "non-sha256 digests"} — nothing to hash-check locally`,
    });
  }

  // 3. Profile / claims.
  if (envelope.profile) {
    const profile = getProfile(envelope.profile);
    if (!profile) {
      checks.push({
        name: "profile",
        group: "claims",
        status: "unknown",
        detail: `profile ${envelope.profile} is not registered with this verifier — its claims were not validated`,
      });
    } else {
      const errors = profile.validate(envelope);
      checks.push(
        errors.length === 0
          ? { name: "profile", group: "claims", status: "pass", detail: `conforms to ${profile.id}` }
          : { name: "profile", group: "claims", status: "fail", detail: errors.join("; ") },
      );
    }
  }
  const knownNamespaces = envelope.profile ? getProfile(envelope.profile)?.namespaces ?? [] : [];
  for (const namespace of Object.keys(envelope.claims ?? {})) {
    if (!knownNamespaces.includes(namespace)) {
      checks.push({
        name: `claims:${namespace}`,
        group: "claims",
        status: "unknown",
        detail: "namespace preserved but not validated by any registered profile — signed claims are assertions, not facts",
      });
    }
  }

  // 4. Artifact signatures.
  if (envelope.signatures.length === 0) {
    checks.push({
      name: "artifact-signatures",
      group: "artifact-signatures",
      status: "warning",
      detail: "envelope is unsigned — integrity and timestamps only, no attribution",
    });
  }
  for (const [i, signature] of envelope.signatures.entries()) {
    const payload = artifactSigningPayload({
      subject: envelope.subject,
      claims: envelope.claims,
      profile: envelope.profile,
      purpose: signature.purpose ?? "artifact",
      scope: signature.scope,
    });
    const expectedDigest = sha256HexUtf8(payload);
    if (signature.payloadDigest !== expectedDigest) {
      checks.push({
        name: `signature[${i}]`,
        group: "artifact-signatures",
        status: "fail",
        detail: `payloadDigest does not match the canonical signing payload (context binding failed — wrong subject, claims, profile, purpose, or scope)`,
      });
      continue;
    }
    try {
      const { valid, detail } = await verifySchemeSignature(
        signature.signer,
        payload,
        signature.signature,
      );
      checks.push({
        name: `signature[${i}]`,
        group: "artifact-signatures",
        status: valid ? "pass" : "fail",
        detail: `${detail}${signature.purpose && signature.purpose !== "artifact" ? ` · purpose "${signature.purpose}"` : ""}`,
      });
    } catch (error) {
      checks.push({
        name: `signature[${i}]`,
        group: "artifact-signatures",
        status: "fail",
        detail: error instanceof Error ? error.message : String(error),
      });
    }
    if (signature.signer.id) {
      checks.push({
        name: `signature[${i}]:identity`,
        group: "artifact-signatures",
        status: "unknown",
        detail: `claims identity "${signature.signer.id}" (${signature.signer.kind}) — the signature proves the key, not the identity binding`,
      });
    }
    if (signature.signer.onBehalfOf) {
      checks.push({
        name: `signature[${i}]:delegation`,
        group: "artifact-signatures",
        status: signature.signer.onBehalfOf.authorization ? "unknown" : "warning",
        detail: signature.signer.onBehalfOf.authorization
          ? `carries a delegation statement for ${signature.signer.onBehalfOf.id} — validate it out of band`
          : `claims to act for ${signature.signer.onBehalfOf.id} with no verifiable delegation statement`,
      });
    }
    checks.push({
      name: `signature[${i}]:key-status`,
      group: "key-status",
      status: "unknown",
      detail: signature.signer.keyStatusUrl
        ? `check rotation/revocation at ${signature.signer.keyStatusUrl}`
        : "no key-status endpoint declared — revocation cannot be checked from the envelope alone",
    });
  }

  // 5. Envelope digest + envelope signatures.
  if (!envelope.envelope) {
    incomplete = true;
    checks.push({
      name: "envelope-digest",
      group: "envelope",
      status: "warning",
      detail: "draft envelope — no envelope digest; receipts are not yet tamper-bound",
    });
  } else {
    const digest = computeEnvelopeDigest(envelope);
    checks.push(
      digest === envelope.envelope.digest.sha256
        ? {
            name: "envelope-digest",
            group: "envelope",
            status: "pass",
            detail: `digest ${digest} matches — receipts cannot have been added, removed, or reordered`,
          }
        : {
            name: "envelope-digest",
            group: "envelope",
            status: "fail",
            detail: `computed ${digest}, envelope says ${envelope.envelope.digest.sha256} — content changed after finalization`,
          },
    );
    if (envelope.envelope.signatures.length === 0) {
      checks.push({
        name: "envelope-signatures",
        group: "envelope-signatures",
        status: "unknown",
        detail: "no envelope signatures — nobody attests to the assembled envelope as a whole",
      });
    }
    for (const [i, signature] of envelope.envelope.signatures.entries()) {
      const payload = envelopeSigningPayload(envelope.envelope.digest.sha256);
      if (signature.payloadDigest !== envelopeSigningPayloadDigest(envelope.envelope.digest.sha256)) {
        checks.push({
          name: `envelope-signature[${i}]`,
          group: "envelope-signatures",
          status: "fail",
          detail: "payloadDigest does not match this envelope's digest",
        });
        continue;
      }
      try {
        const { valid, detail } = await verifySchemeSignature(
          signature.signer,
          payload,
          signature.signature,
        );
        checks.push({
          name: `envelope-signature[${i}]`,
          group: "envelope-signatures",
          status: valid ? "pass" : "fail",
          detail: `assembler: ${detail}`,
        });
      } catch (error) {
        checks.push({
          name: `envelope-signature[${i}]`,
          group: "envelope-signatures",
          status: "fail",
          detail: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  // 6. Receipts, through their adapters.
  const allReceipts: Receipt[] = [
    ...envelope.receipts.storage,
    ...envelope.receipts.settlement,
    ...envelope.receipts.inclusion,
  ];
  for (const [i, receipt] of allReceipts.entries()) {
    const group = RECEIPT_GROUPS[receipt.type];
    const name = `${receipt.type}[${i}]:${receipt.adapter}`;
    const adapter = getAdapter(receipt.adapter);
    if (!adapter) {
      checks.push({
        name,
        group,
        status: "unknown",
        detail: `no registered adapter for "${receipt.adapter}" — receipt preserved but not checked`,
      });
      continue;
    }
    if (adapter.checkOffline) {
      const result = adapter.checkOffline(receipt, envelope);
      checks.push({ name: `${name}:offline`, group, status: result.status, detail: result.detail });
    }
    if (options.checkReceiptsOnline) {
      if (adapter.checkOnline) {
        const result = await adapter.checkOnline(receipt, envelope, {
          endpoints: options.endpoints,
        });
        checks.push({ name: `${name}:online`, group, status: result.status, detail: result.detail });
      } else {
        checks.push({
          name: `${name}:online`,
          group,
          status: "unknown",
          detail: "adapter defines no online check",
        });
      }
    } else if (adapter.checkOnline) {
      checks.push({
        name: `${name}:online`,
        group,
        status: "skipped",
        detail: "offline mode — online confirmation not requested",
      });
    }
  }

  return summarize(checks, incomplete);
};
