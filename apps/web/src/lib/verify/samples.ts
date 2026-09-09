import type { VerificationStatus } from "@fileonchain/verify";

/**
 * Sample envelopes for `/verify`, plus the link helpers behind
 * `/verify?url=` and `/verify?envelope=`.
 *
 * The samples are the protocol package's deterministic conformance
 * fixtures (`packages/protocol/fixtures/`), copied verbatim into
 * `apps/web/public/samples/` so the browser can fetch them like any
 * other envelope URL — the page never imports the fixtures directory at
 * runtime. `test/verify-samples.test.ts` fails if a copy drifts from
 * its fixture or if the verifier stops producing the status the caption
 * promises, so a sample can never become a special-cased happy path.
 *
 * Client-safe: no Node APIs, no server-only imports.
 */

export interface VerifySample {
  /** Stable id, used as the React key. */
  id: string;
  /** File name shared by the fixture and its `public/samples/` copy. */
  file: string;
  /** Short button label. */
  label: string;
  /**
   * Overall status the verifier returns for this sample when loaded with
   * the sample's original subject bytes and no online checks. Pinned by
   * the test; shown in the caption so the visitor knows what to expect.
   */
  expects: VerificationStatus;
  /** One or two sentences, in the standardized vocabulary. */
  caption: string;
}

/**
 * The subject every sample envelope describes — `run-42.txt` from the
 * fixture manifest (`manifest.json#subjectContent`). Loading a sample
 * also supplies these bytes so the subject-integrity check runs for
 * real instead of being skipped.
 */
export const SAMPLE_SUBJECT_CONTENT = "agent run #42 output: all systems nominal";
export const SAMPLE_SUBJECT_NAME = "run-42.txt";

export const VERIFY_SAMPLES: readonly VerifySample[] = [
  {
    id: "signed-with-receipts",
    file: "full-receipts-envelope-signed.json",
    label: "Signed, with receipts",
    expects: "valid-with-warnings",
    caption:
      "An agent key signs the artifact and an organization key signs the envelope, with storage, settlement, and inclusion receipts. Receipts are checked structurally offline, and no key declares a status endpoint, so the honest result is valid with warnings — never a single green “verified”.",
  },
  {
    id: "tampered-signature",
    file: "invalid-signature.json",
    label: "Tampered artifact signature",
    expects: "invalid",
    caption:
      "One bit of the ed25519 artifact signature was flipped. Watch the artifact-signature check fail: the key no longer proves who signed the subject, so the envelope is invalid.",
  },
  {
    id: "removed-receipt",
    file: "removed-receipt.json",
    label: "Receipt removed after sealing",
    expects: "invalid",
    caption:
      "A settlement receipt was deleted after the envelope was finalized. The artifact and envelope signatures still verify, but the envelope digest no longer matches — content changed after finalization, so the envelope is invalid.",
  },
  {
    id: "hash-only",
    file: "minimal-hash-only.json",
    label: "Hash only, unsigned",
    expects: "valid-with-warnings",
    caption:
      "The smallest envelope: a subject digest and a timestamp, no signatures, no receipts. Integrity can be checked against the bytes, but nothing attributes the subject to anyone, so the result is valid with warnings.",
  },
];

/** Public URL of a sample's JSON (served from `public/samples/`). */
export const sampleUrl = (sample: VerifySample): string => `/samples/${sample.file}`;

// ---------------------------------------------------------------------------
// `?envelope=<base64url>` helpers — isomorphic (TextEncoder + atob/btoa).
// ---------------------------------------------------------------------------

/**
 * Upper bound on the encoded `?envelope=` value the UI will offer as a
 * share link. Browsers accept far longer URLs, but chat clients, mail
 * clients, and proxies start mangling links well before 16 KB.
 */
export const MAX_ENVELOPE_PARAM_LENGTH = 8_000;

/** base64url-encode an envelope's JSON text for `/verify?envelope=`. */
export const encodeEnvelopeParam = (json: string): string => {
  const bytes = new TextEncoder().encode(json);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

/**
 * Decode a `?envelope=` value back to JSON text. Accepts base64url and
 * plain base64 (a pasted link may have been re-encoded along the way).
 * Throws on malformed input.
 */
export const decodeEnvelopeParam = (param: string): string => {
  const base64 = param.replace(/-/g, "+").replace(/_/g, "/").replace(/\s+/g, "");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
};

/**
 * Validate a `?url=` value. Only http(s) origins are fetched — the
 * request goes from the visitor's browser straight to that origin, so
 * the remote host must allow cross-origin reads (CORS). Returns null
 * when the value is not an http(s) URL.
 */
export const parseRemoteEnvelopeUrl = (value: string): URL | null => {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return null;
  }
  return url.protocol === "https:" || url.protocol === "http:" ? url : null;
};

/** Build a `/verify?envelope=` link, or null when the envelope is too large. */
export const buildEnvelopeShareLink = (json: string, origin: string): string | null => {
  const encoded = encodeEnvelopeParam(json);
  if (encoded.length > MAX_ENVELOPE_PARAM_LENGTH) return null;
  return `${origin}/verify?envelope=${encoded}`;
};
