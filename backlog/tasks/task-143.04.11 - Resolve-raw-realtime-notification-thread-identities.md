---
id: TASK-143.04.11
title: Resolve raw realtime notification thread identities
status: Done
assignee:
  - '@codex'
created_date: '2026-09-04 15:52'
updated_date: '2026-09-04 16:02'
labels: []
dependencies: []
modified_files:
  - src/runtime/codex-realtime/lib/adapter.ts
  - src/runtime/codex-realtime/lib/records.ts
  - src/runtime/codex-realtime/tests/adapter.test.ts
  - src/runtime/codex-realtime/tests/adapter-races.test.ts
  - src/runtime/codex-realtime/tests/notification-identity.test.ts
parent_task_id: TASK-143.04
priority: high
type: bug
ordinal: 286000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-143.04.07 reached the exact Codex 0.151.0 notification path but valid realtime notifications left the session negotiating. App-server notifications carry a raw threadId while the active realtime binding stores Archboard’s canonical ThreadId. The notification record boundary compares those unlike representations directly. This child owns the smallest runtime fix that unblocks TASK-143.04.07 without weakening identity rejection.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Every relevant realtime notification record resolves its inbound raw threadId through the existing identity decoder before matching the canonical coordinator ThreadId.
- [x] #2 Unknown, invalid, stale, wrong-thread, wrong-session, and wrong-generation notifications remain rejected and cannot advance or mutate the active realtime session.
- [x] #3 A focused runtime owner fails for the raw-to-canonical mismatch before the fix and passes after it, covering the legitimate match plus materially distinct invalid, stale, and wrong identity cases.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add a focused runtime adapter regression that sends the raw coordinator thread ID used by Codex and proves the start leaves negotiating only before the fix. Keep distinct assertions that unknown or wrong raw identities, stale child or epoch correlations, and wrong realtime session or version cannot settle the start.
2. Resolve notification threadId once at exactNotification through the existing trusted identity decoder, compare the resolved canonical ThreadId to the active binding, and reject identity validation failures without mutation. Keep this single boundary in front of every realtime notification record kind.
3. Run the focused adapter and identity owners, root and frontend type checks if the changed imports affect them, scoped formatter and linter checks, and inspect the fixed-base diff. Commit the review-ready task and code range without finalizing the task.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Red proof: `bun test src/runtime/codex-realtime/tests/adapter.test.ts --test-name-pattern "resolves the raw coordinator thread identity"` failed because valid raw SDP and started notifications emitted only requesting_permission and negotiating states. The focused owner now lives in notification-identity.test.ts.

Implemented one inbound notification identity boundary: exactNotification resolves raw threadId through the existing authority decoder, compares the resulting canonical ThreadId to the active coordinator binding, and returns false for unresolved identities. Every realtime notification method passes this gate before reduction. Existing adapter fixtures now send raw app-server IDs.

Validation: 32 focused realtime/identity tests and 531 assertions pass; root and frontend TypeScript pass; scoped Oxlint and Oxfmt pass. Browser and broad suites were not run because TASK-143.04.07 owns browser evidence and this task forbids broad validation.

Final integration evidence on canonical branch: exact fast-forward to reviewed commit bdb58ace from fixed base b3834b12. `bun test` passed 32 tests across the three realtime adapter owners and shared identity owner with 531 assertions. Root and frontend `tsc --noEmit`, scoped Oxlint, and scoped Oxfmt passed. No browser or broad suite ran; TASK-143.04.07 owns the downstream browser proof.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Resolved raw Codex realtime notification thread IDs through the trusted identity decoder before matching the canonical coordinator binding. Focused tests prove valid negotiation now reaches listening while invalid, stale, wrong-thread, wrong-session, and wrong-generation notifications remain inert. Verified with 32 focused tests, 531 assertions, both TypeScript projects, and scoped lint and format checks.
<!-- SECTION:FINAL_SUMMARY:END -->
