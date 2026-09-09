import { execFileSync } from "node:child_process";
import { appendFileSync, globSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { ed25519 } from "@noble/curves/ed25519.js";
import { FileOnChainClient } from "@fileonchain/api";
import {
  createEvidence,
  signEnvelope,
  subjectFromBytes,
  type EvidenceSigner,
} from "@fileonchain/sdk/evidence";
import { bytesToHex, canonicalStringify, hexToBytes, sha256Hex } from "@fileonchain/sdk/protocol";
import { verifyEnvelope, type EvidenceEnvelope } from "@fileonchain/verify";

/**
 * seal.ts — the sealer behind `.github/actions/seal-release`.
 *
 * 1. Hash every matched artifact (sha256 + size) into a release manifest —
 *    a small canonical JSON file naming the repository, tag, commit, and
 *    artifacts. The manifest is the envelope's *subject* (type
 *    `manifest`), so one envelope covers the whole release and anyone
 *    holding the manifest can re-check each artifact against it.
 * 2. Build the envelope with the reference SDK (`@fileonchain/sdk/evidence`)
 *    — no new protocol behaviour, no application profile, no claims. With
 *    an ed25519 key the workflow signs the artifact (the manifest) and the
 *    envelope; without one the envelope proves integrity and time only.
 * 3. Optionally store the envelope in FileOnChain Cloud (`POST
 *    /api/v1/evidence`). Cloud-only fields never enter the envelope — the
 *    Cloud returns the envelope it stored and that is what gets attached.
 * 4. Run the open verifier over the result with the manifest bytes.
 * 5. Attach the envelope + manifest to the GitHub Release and append the
 *    status badge to the release notes, both through `gh`.
 *
 * Inputs arrive as `SEAL_*` environment variables (see action.yml).
 * `SEAL_DRY_RUN=1` skips every `gh` call so the sealer can be exercised
 * locally: `SEAL_DRY_RUN=1 SEAL_FILES=README.md SEAL_TAG=v0.0.0 pnpm seal`.
 */

const env = (name: string, fallback = ""): string => process.env[name] ?? fallback;
const flag = (name: string, fallback: boolean): boolean => {
  const v = env(name).trim().toLowerCase();
  if (v === "") return fallback;
  return v === "1" || v === "true" || v === "yes";
};

const fail = (message: string): never => {
  console.error(`::error::${message}`);
  process.exit(1);
};

const gh = (args: string[], opts: { input?: string } = {}): string =>
  execFileSync("gh", args, { encoding: "utf8", input: opts.input, stdio: ["pipe", "pipe", "inherit"] });

const setOutput = (name: string, value: string): void => {
  const file = env("GITHUB_OUTPUT");
  if (!file) return;
  // Multiline-safe heredoc form.
  const marker = `EOF_${Math.random().toString(36).slice(2)}`;
  appendFileSync(file, `${name}<<${marker}\n${value}\n${marker}\n`);
};

const addSummary = (markdown: string): void => {
  const file = env("GITHUB_STEP_SUMMARY");
  if (file) appendFileSync(file, `${markdown}\n`);
  else console.log(markdown);
};

/* ------------------------------------------------------------------ */
/* Inputs                                                              */
/* ------------------------------------------------------------------ */

const dryRun = flag("SEAL_DRY_RUN", false);
const repository = env("GITHUB_REPOSITORY") || (dryRun ? "example/repo" : fail("GITHUB_REPOSITORY is not set"));
const commit = env("GITHUB_SHA");
const serverUrl = env("GITHUB_SERVER_URL", "https://github.com").replace(/\/$/, "");
const tag = env("SEAL_TAG").trim() || fail("`tag` is empty — run on a release event or pass `tag`.");
const patterns = env("SEAL_FILES")
  .split(/\r?\n/)
  .map((s) => s.trim())
  .filter(Boolean);
if (patterns.length === 0) fail("`files` is empty — list at least one file or glob to seal.");
const outputPath = resolve(env("SEAL_OUTPUT", "fileonchain-evidence.json"));
const manifestPath = resolve(env("SEAL_MANIFEST_OUTPUT", "fileonchain-release-manifest.json"));
const signingKey = env("SEAL_SIGNING_KEY").trim().toLowerCase().replace(/^0x/, "");
const signerId = env("SEAL_SIGNER_ID").trim() || `github:${repository}`;
const apiKey = env("SEAL_API_KEY").trim();
const apiUrl = env("SEAL_API_URL", "https://fileonchain.org").replace(/\/$/, "");
const siteUrl = env("SEAL_SITE_URL", "https://fileonchain.org").replace(/\/$/, "");
const attach = flag("SEAL_ATTACH", true) && !dryRun;
const appendBadge = flag("SEAL_APPEND_BADGE", true) && !dryRun;

/* ------------------------------------------------------------------ */
/* 1. Manifest                                                         */
/* ------------------------------------------------------------------ */

const matches = new Set<string>();
for (const pattern of patterns) {
  for (const file of globSync(pattern, { cwd: process.cwd() })) {
    const full = resolve(file);
    if (statSync(full).isFile()) matches.add(file);
  }
}
if (matches.size === 0) fail(`No files matched: ${patterns.join(", ")}`);

const artifacts = Array.from(matches)
  .sort()
  .map((file) => {
    const bytes = readFileSync(resolve(file));
    return { name: file.replace(/\\/g, "/"), sha256: sha256Hex(new Uint8Array(bytes)), size: bytes.length };
  });

const manifest = {
  repository,
  release: tag,
  ...(commit ? { commit } : {}),
  artifacts,
};
const manifestText = canonicalStringify(manifest);
const manifestBytes = new TextEncoder().encode(manifestText);
writeFileSync(manifestPath, manifestText);

/* ------------------------------------------------------------------ */
/* 2. Envelope                                                         */
/* ------------------------------------------------------------------ */

const signers: EvidenceSigner[] = [];
if (signingKey) {
  if (!/^[0-9a-f]{64}$/.test(signingKey)) fail("`signing-key` must be a 32-byte ed25519 seed as 64 hex chars.");
  const seed = hexToBytes(signingKey);
  const publicKey = bytesToHex(ed25519.getPublicKey(seed));
  const encoder = new TextEncoder();
  signers.push({
    signer: { kind: "service", id: signerId, publicKey, scheme: "ed25519" },
    sign: (payload) => bytesToHex(ed25519.sign(encoder.encode(payload), seed)),
    signedAt: new Date().toISOString(),
  });
}

let envelope: EvidenceEnvelope = await createEvidence({
  subject: subjectFromBytes(manifestBytes, {
    type: "manifest",
    name: basename(manifestPath),
    mediaType: "application/json",
  }),
  signers,
});
if (signers.length > 0) envelope = await signEnvelope(envelope, signers);

/* ------------------------------------------------------------------ */
/* 3. Optional: FileOnChain Cloud                                      */
/* ------------------------------------------------------------------ */

let cloudEnvelopeId: string | null = null;
if (apiKey) {
  const client = new FileOnChainClient({ apiKey, baseUrl: apiUrl });
  try {
    const stored = await client.submitEvidence({ envelope });
    cloudEnvelopeId = stored.envelopeId;
    // The Cloud returns the envelope it stored (identical, unless the org
    // asked for a server-side envelope signature). Attach that one.
    envelope = stored.envelope;
  } catch (err) {
    fail(`FileOnChain Cloud rejected the envelope: ${err instanceof Error ? err.message : String(err)}`);
  }
}

const envelopeText = `${JSON.stringify(envelope, null, 2)}\n`;
writeFileSync(outputPath, envelopeText);
const envelopeDigest = envelope.envelope?.digest.sha256 ?? "";

/* ------------------------------------------------------------------ */
/* 4. Verify locally                                                   */
/* ------------------------------------------------------------------ */

const report = await verifyEnvelope(envelope, { subjectBytes: manifestBytes });
const icons = { pass: "✓", fail: "✗", warning: "!", skipped: "-", unknown: "?" } as const;
console.log(`FileOnChain evidence: ${report.status}`);
for (const check of report.checks) {
  console.log(`  ${icons[check.status]} [${check.group}] ${check.name} — ${check.detail}`);
}
if (report.status === "invalid") fail("The sealed envelope does not verify — refusing to attach it.");

/* ------------------------------------------------------------------ */
/* 5. Attach + badge                                                   */
/* ------------------------------------------------------------------ */

const assetUrl = `${serverUrl}/${repository}/releases/download/${encodeURIComponent(tag)}/${encodeURIComponent(basename(outputPath))}`;
const verifyUrl = `${siteUrl}/verify?url=${encodeURIComponent(assetUrl)}`;
const badgeUrl = `${siteUrl}/api/badge?url=${encodeURIComponent(assetUrl)}`;
const badgeMarkdown = `[![FileOnChain evidence: ${report.status}](${badgeUrl})](${verifyUrl})`;

if (attach) {
  gh(["release", "upload", tag, outputPath, manifestPath, "--clobber", "--repo", repository]);
  console.log(`Attached ${basename(outputPath)} and ${basename(manifestPath)} to ${tag}.`);
}

if (appendBadge) {
  const body = gh(["release", "view", tag, "--repo", repository, "--json", "body", "--jq", ".body"]).replace(/\s+$/, "");
  if (body.includes(badgeUrl)) {
    console.log("Release notes already carry the badge — leaving them untouched.");
  } else {
    const section = [
      "",
      "",
      "---",
      "",
      badgeMarkdown,
      "",
      `Evidence for this release: [${basename(outputPath)}](${assetUrl}) (subject: [${basename(manifestPath)}](${assetUrl.replace(encodeURIComponent(basename(outputPath)), encodeURIComponent(basename(manifestPath)))})). `,
      `The badge shows the open verifier's result — status \`${report.status}\` at seal time — and links to a report you can reproduce in your browser. `,
      `Locally: \`fileonchain verify ${basename(outputPath)} --artifact ${basename(manifestPath)}\`.`,
    ].join("\n");
    const dir = mkdtempSync(join(tmpdir(), "seal-release-"));
    const notes = join(dir, "notes.md");
    writeFileSync(notes, `${body}${section}\n`);
    gh(["release", "edit", tag, "--repo", repository, "--notes-file", notes]);
    console.log("Appended the badge to the release notes.");
  }
}

/* ------------------------------------------------------------------ */
/* Outputs + summary                                                   */
/* ------------------------------------------------------------------ */

setOutput("status", report.status);
setOutput("envelope-digest", envelopeDigest);
setOutput("evidence-path", outputPath);
setOutput("manifest-path", manifestPath);
setOutput("verify-url", attach ? verifyUrl : "");
setOutput("badge-markdown", badgeMarkdown);

addSummary(
  [
    `## FileOnChain evidence — \`${report.status}\``,
    "",
    `- Release: \`${tag}\` (${artifacts.length} artifact${artifacts.length === 1 ? "" : "s"})`,
    `- Envelope digest: \`${envelopeDigest}\``,
    `- Artifact signatures: ${envelope.signatures.length} · envelope signatures: ${envelope.envelope?.signatures.length ?? 0}`,
    cloudEnvelopeId ? `- FileOnChain Cloud envelope id: \`${cloudEnvelopeId}\`` : "- FileOnChain Cloud: not used",
    attach ? `- Attached: [${basename(outputPath)}](${assetUrl})` : "- Attach: skipped",
    "",
    "```markdown",
    badgeMarkdown,
    "```",
    "",
    "The verifier's status is what the badge and the report page show. An envelope proves existence, integrity, signing keys, and timing — not truth or authorship.",
  ].join("\n"),
);
