# seal-release — GitHub Action starter

Seal the artifacts of a GitHub Release into a FileOnChain evidence
envelope, verify it with the open verifier, attach it to the release, and
append a status badge to the release notes.

**Status: starter.** The action runs in this repository's own
[`seal-release` workflow](../../workflows/seal-release.yml) on every
published release. It is not on the GitHub Marketplace and the
`@fileonchain/*` packages are not on npm yet, so the action installs a
filtered slice of this monorepo at run time (about a minute on a hosted
runner). Treat the interface as unstable until it is published as a
standalone action.

## What it produces

- `fileonchain-release-manifest.json` — the **subject**: a canonical JSON
  list of `{ name, sha256, size }` for every matched artifact, plus the
  repository, tag, and commit. One envelope covers the whole release.
- `fileonchain-evidence.json` — the **envelope** (`subject.type:
  "manifest"`), built with `@fileonchain/sdk/evidence`. With a signing
  key the workflow adds an artifact signature (who signed the manifest)
  and an envelope signature (who assembled the envelope). Without one the
  envelope proves integrity and time only and verifies as
  `valid-with-warnings`.
- Both files attached to the release, and this appended to the notes:

  ```markdown
  [![FileOnChain evidence: valid-with-warnings](https://fileonchain.org/api/badge?url=…)](https://fileonchain.org/verify?url=…)
  ```

  The badge re-runs the verifier on the attached envelope every time it
  is fetched; the link opens the same report in the reader's browser.

No application profile, no claims, no Cloud-only fields: the envelope is
a plain protocol envelope and verifies with `fileonchain verify
fileonchain-evidence.json --artifact fileonchain-release-manifest.json`.

## Usage

```yaml
on:
  release:
    types: [published]

permissions:
  contents: write

jobs:
  seal:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      # …build your artifacts…
      - uses: FileOnchain/fileonchain-org/.github/actions/seal-release@main
        with:
          files: |
            dist/*.tgz
            dist/checksums.txt
          signing-key: ${{ secrets.FILEONCHAIN_SIGNING_KEY }}   # optional
          api-key: ${{ secrets.FILEONCHAIN_API_KEY }}           # optional
```

| Input | Default | Meaning |
| --- | --- | --- |
| `files` | required | Newline-separated globs of artifacts to hash. |
| `tag` | the triggering release | Release to attach to. |
| `signing-key` | — | ed25519 seed, 64 hex chars. Generate one with `openssl rand -hex 32`. |
| `signer-id` | `github:<owner>/<repo>` | Id recorded on the signature. |
| `api-key` | — | `fok_…` org-scoped key; stores the envelope in FileOnChain Cloud. |
| `api-url` | `https://fileonchain.org` | Cloud origin. |
| `site-url` | `https://fileonchain.org` | Origin for the badge and report links. |
| `attach` | `true` | Upload the envelope and manifest as release assets. |
| `append-badge` | `true` | Append the badge and instructions to the release notes. |
| `output` | `fileonchain-evidence.json` | Envelope file name. |

Outputs: `status`, `envelope-digest`, `evidence-path`, `manifest-path`,
`verify-url`, `badge-markdown`.

## Running the sealer locally

```sh
pnpm install --filter "@fileonchain/seal-release-action..."
cd /path/to/your/artifacts
SEAL_DRY_RUN=1 SEAL_FILES="*.tgz" SEAL_TAG=v0.0.0 \
  /path/to/fileonchain-org/.github/actions/seal-release/node_modules/.bin/tsx \
  /path/to/fileonchain-org/.github/actions/seal-release/src/seal.ts
fileonchain verify fileonchain-evidence.json --artifact fileonchain-release-manifest.json
```

`SEAL_DRY_RUN=1` skips every `gh` call and only writes the two files into
the current directory. (`pnpm seal` inside the action folder works too,
but then the globs resolve against that folder.)

## Guardrails

The badge and the summary repeat the verifier's status word for word —
`valid`, `valid-with-warnings`, `incomplete`, `invalid` — and never say
"verified". An envelope proves existence, integrity, signing keys, and
timing; it does not prove truth, legal validity, or authorship.
