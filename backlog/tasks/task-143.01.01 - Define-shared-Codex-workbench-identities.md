---
id: TASK-143.01.01
title: Define shared Codex workbench identities
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-30 15:06'
updated_date: '2026-08-30 19:04'
labels: []
dependencies: []
references:
  - docs/adr/0019-the-workbench-owns-one-codex-app-server-session.md
modified_files:
  - src/shared/codex-workbench-identity
parent_task_id: TASK-143.01
priority: high
type: task
ordinal: 171000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Own opaque branded identities and closed correlation records shared by the runtime and browser contracts. No module may substitute a string across identity domains or infer identity from recency.

Delegation profile: gpt-5.6-luna, xhigh.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Distinct opaque types exist for ChildId, ChildEpoch, BrowserCommandId, ThreadId, TurnId, ItemId, QueuedSubmissionId, LoginId, JSON-RPC request id, DynamicToolCallId, RealtimeSessionId, and ApprovalId.
- [ ] #2 A wire-request correlation is exactly child, epoch, requestId; a logical tool-call correlation is exactly child, epoch, threadId, turnId, callId, namespace, tool, and manifestHash.
- [ ] #3 Parsers validate wire strings once, preserve opacity across DTOs, and reject empty, wrong-domain, stale-epoch, or caller-fabricated identities.
- [ ] #4 Type fixtures prove that thread/turn/item/queue/login/request identities cannot be interchanged and runtime fixtures prove stable round trips.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Define one domain-tagged wire grammar and unique branded string types for the twelve required identity domains, with host-only minting and explicit validation errors.
2. Add an identity authority that owns the current ChildId/ChildEpoch, adopts validated server identities once, rejects unknown/caller-fabricated values, and checks child/epoch freshness.
3. Export exact closed WireRequestCorrelation and LogicalToolCallCorrelation records plus strict parsers/builders that validate identity domains, correlation keys, namespace/tool/hash bounds, and current epoch.
4. Add module-root contract tests and type fixtures proving all required brands are distinct, records have exact keys, invalid/wrong-domain/stale/unissued values fail, and authority-created identities round-trip stably.
5. Run focused module tests, the strict repository type check, and the relevant module-boundary/lint checks; record evidence in implementation notes.

6. Remediation: split the public validator from explicit host issuer and trusted protocol decoder capabilities; keep server-owned adoption/brand-producing parsing only on the trusted decoder, and retain host minting separately.
7. Preserve raw server identity strings in the authority and expose one typed Codex serializer; expand runtime coverage through raw adoption, JSON round trip, byte-identical serialization, stale epoch, wrong-domain, and unissued cases.
8. Replace the sampled type fixture with a complete pairwise non-interchangeability matrix for ThreadId, TurnId, ItemId, QueuedSubmissionId, LoginId, and JsonRpcRequestId, plus exact correlation-key assertions; remove the duplicate JSONRPCRequestId alias.

9. Narrow follow-up: reject ill-formed UTF-16 before raw identity encoding so lone surrogates cannot collide after TextEncoder replacement; add high/low-surrogate rejection and distinct well-formed-Unicode byte-round-trip fixtures. Correct the recorded repository-check count to 48 tests and 145 assertions.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented the module-root identity contract in src/shared/codex-workbench-identity. Added unique branded ChildId, ChildEpoch, BrowserCommandId, ThreadId, TurnId, ItemId, QueuedSubmissionId, LoginId, JsonRpcRequestId/JSONRPCRequestId, DynamicToolCallId, RealtimeSessionId, and ApprovalId values; domain-tagged parsing; host authority mint/adopt/issuance checks; child-bound epochs; current-epoch guards; and exact closed wire-request/logical-tool-call correlations. Added public-entrypoint runtime round-trip/refusal tests and compiler fixtures for cross-domain assignment rejection.

Validation evidence: bun test --isolate src/shared/codex-workbench-identity (exit 0, 6 passed, 42 assertions); bun run type-check (exit 0); bunx oxlint src/shared/codex-workbench-identity (exit 0); bunx oxfmt --check src/shared/codex-workbench-identity (exit 0); bun test --isolate tests/system/repository-policy/boundaries.test.ts (exit 0, 9 passed). Dependency setup required one bun install because node_modules was absent; no lockfile changes.

Reviewer remediation accepted: the original authority exposed unrestricted brand-producing parsers/adoption and discarded raw server IDs. Remediation will make capability boundaries explicit (validator for ordinary consumers, host issuer for host-owned minting, trusted decoder for server-owned protocol values), preserve raw values for one authority-owned serializer, remove the JSONRPCRequestId alias, and strengthen compile-time fixture coverage to all pairwise required-domain assignments and exact record keys.

Remediation implemented on the same worker branch for all five accepted review findings. IdentityAuthority now separates IdentityValidator (current child/epoch checks only), IdentityIssuer (host-owned browser-command, JSON-RPC request, realtime-session, and epoch minting), and TrustedIdentityDecoder (protocol-only brand parsing/adoption, exact correlation parsing, and one Codex serializer). Server-owned thread/turn/item/queue/login/request/dynamic-call/approval identities are adopted only by the trusted decoder; host-owned IDs remain issuer-minted. Raw Codex strings are encoded into opaque values with an authority map and serializeCodexIdentity returns the exact original string. The module root no longer exports unrestricted identity parsers or the duplicate JSONRPCRequestId alias.

Remediation validation: bunx tsc --noEmit --listFiles --pretty false | rg the type-fixtures.ts absolute path (exit 0; fixture listed); bun test --isolate src/shared/codex-workbench-identity (exit 0, 6 passed, 59 assertions); bun run type-check (exit 0); bunx oxlint src/shared/codex-workbench-identity (exit 0); bunx oxfmt --check src/shared/codex-workbench-identity (exit 0); bun test --isolate tests/system/repository-policy/boundaries.test.ts tests/system/repository-policy/test-inventory.test.ts (exit 0, 48 passed, 145 assertions). Raw serializer fixture covers punctuation, whitespace, control characters, and Unicode with byte equality.

Rereview follow-up accepted: raw adoption must fail closed for lone UTF-16 surrogates because TextEncoder would otherwise replace them and collide with literal U+FFFD. The follow-up validates surrogate pairs/code points before encoding, adds high/low-surrogate rejection and distinct well-formed-Unicode fixtures, and records the corrected boundary/inventory result count above.

Narrow follow-up implemented: encodeRawIdentity now validates UTF-16 surrogate pairing before TextEncoder, rejecting lone high/low surrogates so malformed strings cannot collide with U+FFFD. Well-formed supplementary Unicode and literal U+FFFD remain distinct and serialize byte-identically. The repository-check note is corrected to the exact command result: 48 tests and 145 assertions.

Follow-up validation: bun test --isolate src/shared/codex-workbench-identity (exit 0, 7 passed, 65 assertions); bun run type-check (exit 0); bunx tsc --noEmit --listFiles --pretty false with the type-fixtures.ts path check (exit 0; fixture listed); bunx oxlint src/shared/codex-workbench-identity (exit 0); bunx oxfmt --check src/shared/codex-workbench-identity (exit 0); bun test --isolate tests/system/repository-policy/boundaries.test.ts tests/system/repository-policy/test-inventory.test.ts (exit 0, 48 passed, 145 assertions).
<!-- SECTION:NOTES:END -->
