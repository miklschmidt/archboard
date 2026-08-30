---
id: TASK-143.01.01
title: Define shared Codex workbench identities
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-30 15:06'
updated_date: '2026-08-30 18:42'
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
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented the module-root identity contract in src/shared/codex-workbench-identity. Added unique branded ChildId, ChildEpoch, BrowserCommandId, ThreadId, TurnId, ItemId, QueuedSubmissionId, LoginId, JsonRpcRequestId/JSONRPCRequestId, DynamicToolCallId, RealtimeSessionId, and ApprovalId values; domain-tagged parsing; host authority mint/adopt/issuance checks; child-bound epochs; current-epoch guards; and exact closed wire-request/logical-tool-call correlations. Added public-entrypoint runtime round-trip/refusal tests and compiler fixtures for cross-domain assignment rejection.

Validation evidence: bun test --isolate src/shared/codex-workbench-identity (exit 0, 6 passed, 42 assertions); bun run type-check (exit 0); bunx oxlint src/shared/codex-workbench-identity (exit 0); bunx oxfmt --check src/shared/codex-workbench-identity (exit 0); bun test --isolate tests/system/repository-policy/boundaries.test.ts (exit 0, 9 passed). Dependency setup required one bun install because node_modules was absent; no lockfile changes.
<!-- SECTION:NOTES:END -->
