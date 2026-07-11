# ADR 0007 — The FileOnChain naming decision

**Status:** Accepted
**Date:** 2026-07

## Context

Separating the neutral protocol from the opinionated profile and the
hosted product raised the naming question: does "FileOnChain" name the
company, the product, the protocol, or all of them? The name also
carries baggage — it suggests "files stored on chains," while the
protocol's default is hash-only evidence about subjects that need not
be files at all. Options considered: rename the protocol to something
neutral and unrelated (a new brand with no equity and a migration
cost), keep one undifferentiated name for everything (perpetuating the
v2 confusion between spec and product), or keep the name as an
umbrella with strictly qualified layer names.

## Decision

**FileOnChain is the umbrella brand.** The layers get qualified,
non-interchangeable names:

| Layer | Name | Nature |
| --- | --- | --- |
| Specification | **FileOnChain Evidence Protocol** | Neutral, normative, open. |
| First profile | **FileOnChain Agent Evidence Profile** (`org.fileonchain.agent/v1`) | Opinionated, normative for its namespace. |
| Hosted product | **FileOnChain Cloud** | Commercial, non-normative — never called "the v1 product". |
| Code | **Reference implementations** — `@fileonchain/protocol`, `@fileonchain/agent-profile`, `@fileonchain/verify`, and the **reference SDK** `@fileonchain/sdk` | Open source, MIT. |

Accompanying terminology rules, applied across all documentation and
product surfaces: "evidence envelope" is the protocol term ("evidence
package" acceptable user-facing); "storage system" and "settlement
system," not storage/anchoring *chain*; "multi-system settlement
receipts," never "cross-chain proof"; "locally verified evidence,"
never "verified claim."

## Consequences

- Existing brand equity, domain, and npm scope are retained; no
  migration of package names or URLs.
- Every document must say which layer it belongs to (the protocol spec
  carries no product content; the Cloud doc is marked non-normative),
  which this ADR makes an enforceable review rule.
- The name's file-storage connotation is handled by copy, not by
  renaming: the protocol's subject is "any digital thing," storage is
  optional, and documentation leads with evidence rather than storage.
- Third parties can implement the FileOnChain Evidence Protocol
  without implying any relationship with FileOnChain Cloud.
- If the umbrella ever becomes untenable (e.g. standardization under a
  neutral body), the protocol name can be spun out in a future version
  — this decision optimizes for now, not forever.
