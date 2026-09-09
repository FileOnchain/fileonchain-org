/**
 * CLI snippet for the homepage quickstart: the verify command plus a
 * trimmed transcript of its real output. The lines are taken from running
 * `fileonchain verify` against the protocol conformance fixtures
 * (`packages/protocol/fixtures/agent-profile-multi-signer.json`) with the
 * artifact bytes supplied; digests and long details are shortened, nothing is
 * invented. The
 * result word is the verifier's own status, never a bare "verified".
 */
export const CLI_QUICKSTART_SNIPPET = `$ npx -p @fileonchain/verify fileonchain verify evidence.json --artifact report.md

[schema]
  ✓ schema              pass     evidence envelope v1 · profile org.fileonchain.agent/v1
[subject]
  ✓ subject-sha256      pass     sha256 cf33…e3de matches
[claims]
  ✓ profile             pass     conforms to org.fileonchain.agent/v1
[artifact-signatures]
  ✓ signature[0]        pass     EIP-191 signature by 0x7099…79C8
[key-status]
  ? signature[0]:key-status  unknown  no key-status endpoint declared
[envelope]
  ! envelope-digest     warning  digest 348b…83cf is self-consistent but unsigned

result: VALID-WITH-WARNINGS
attested: yes`;
