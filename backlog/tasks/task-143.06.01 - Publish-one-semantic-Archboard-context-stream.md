---
id: TASK-143.06.01
title: Publish one semantic Archboard context stream
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-30 15:08'
updated_date: '2026-08-31 00:44'
labels: []
dependencies:
  - TASK-143.01.01
  - TASK-143.01.16
references:
  - docs/adr/0005-push-to-codex-via-app-server.md
  - docs/adr/0019-the-workbench-owns-one-codex-app-server-session.md
modified_files:
  - src/runtime/codex-semantic-context
parent_task_id: TASK-143.06
priority: high
type: task
ordinal: 190000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Publish one semantic Archboard context stream and explicit typed subscriptions for settled board change, pane focus, pane selection, and on-demand fresh brief. It reuses the existing change-feed settle boundary and owns no second timer.

Delegation profile: gpt-5.6-luna, max.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Public ports expose settled semantic change events, immediate pane-focus events, immediate pane-selection events, and an on-demand fresh-brief query with board/pane/version/cursor/freshness identity.
- [ ] #2 Existing change-feed settle/debounce remains the sole semantic coalescing timer; the publisher filters agent-only/cosmetic noise and never snapshots a second board document.
- [ ] #3 Brief generation is deterministic, bounded to realtime limits, marks truncation/ambiguity/staleness, and includes repository/workhorse/coordinator/board/pane/version/selection/claim/doing/cursor/compact description.
- [ ] #4 Module tests prove each port independently, source classification, rapid focus/selection without settle delay, fresh on-demand reads, and no duplicate subscription/timer after reload.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Reconcile the existing semantic change-feed settle boundary, pane focus/selection sources, shared identity/timing, and frozen realtime context limits.
2. Implement one instance-scoped semantic-context publisher with explicit settled-change, immediate focus, immediate selection, and on-demand fresh-brief ports, reusing the existing settle timer and canonical board truth.
3. Add deterministic module tests for every port, source/noise filtering, rapid focus and selection, freshness, bounded truncation/ambiguity, reload-safe subscription lifetime, and absence of duplicate timers or board snapshots.
4. Run focused publisher tests, complete module and repository lanes, both TypeScript projects, lint, format, diff and clean-status checks; record evidence without finalizing before independent review.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Parallel reservation at integration HEAD 863ec41 after removing the unjustified worker/reviewer caps: TASK-143.06.01 is dependency-ready and path-disjoint from all active work. It is dispatched now; later thread delivery remains dependency-gated on the instruction/session/link owners.

Implementation ready for review at commit 9853ff65fb967d08f6cc1f8ef5f3cff5b98c3e05.

Decision: the publisher consumes the existing settled-feed callback and exposes one typed pane-signal adapter for immediate focus and selection; it owns no settle timer, board elements, or document snapshot. Fresh context is read only when requested. UTF-8 limits, cursor qualification, ambiguity, staleness, and immutable deterministic payloads are enforced in the module.

Validation: focused publisher tests 7/7; bun run type-check; bun run lint; bun run fmt:check; bun run test:modules (1,020/1,020); bun run test:system (284/284); bun run test:repository (130/130); bun run test:serial-browser (all listed owners passed); git diff --check clean.

Scope: only src/runtime/codex-semantic-context/** plus this task record. Task status, assignment, dependencies, acceptance criteria, and final summary were not changed.

Independent rereview remediation at code commit 1353f79: aggregate UTF-8 admission now fits every mutable brief field with required-field minima and deterministic truncation; cursors use the typed {feedId, sequence} grammar with source-event precedence and stale prior-feed reporting; source registration/disposal are transactional and attempt all cleanup; listener fanout snapshots, continues after throws, and exposes ordered instance-scoped diagnostics. Added adversarial coverage for hostile multibyte maxima, malformed and prior-feed cursors, lifecycle rollback/cleanup, replacement bindings, reentrant fanout, unsubscribe snapshots, and recovery. Final validation: focused semantic-context lane 14/14; full modules 1,027/1,027; repository policy 130/130; system 284/284; both TypeScript projects, lint, format, and diff checks passed. Scope remains src/runtime/codex-semantic-context/** plus this task record; no UI/server paths or src-DlBR1tzg.js were changed.

Second remediation implementation and validation (2026-08-31):
- Aggregate briefs now fit against the actual UTF-8 byte length of their canonical JSON rendering. String slots use a JSON-aware clipper that accounts for quotes, backslashes, all JSON control escapes, lone surrogates, and complete Unicode code points; fixed identity fields, cursor feed identity, arrays, and truncation markers are included in the deterministic priority order. Public tests cover admitted hostile boundary values, all mutable maxima, maximum fixed identities, JSON.parse, deterministic bytes, and no surrogate-pair split. The authored NUL-free string contract remains explicit.
- Public SemanticCursorInput is now only {feedId, sequence}; numeric cursors remain only on SettledChangeSourceEvent. Runtime rejection covers numbers and malformed shapes; tests cover current/prior feeds, restart feed identity, source sequence derivation, and the compile-time fixture.
- Listener diagnostics are instance-local and bounded. Concrete policy: retain the oldest 64 entries; cap each error-name JSON string token at 128 UTF-8 bytes and message token at 2,048 bytes; no unbounded thrown text is retained. Fixed record bytes are 111, calculated as the UTF-8 bytes of the settled-change diagnostic object with empty errorName and message and a maximum-safe listenerIndex, less the two empty string tokens (2 + 2). A maximum record is 111 + 128 + 2,048 = 2,287 bytes. The batch bound is a 12-byte entries-array prefix + (64 * 2,287) + 63 separators + a 34-byte maximum-safe droppedCount suffix = 146,477 UTF-8 bytes per publisher instance before drain. Oldest-retained behavior, dropped-count overflow accounting, frozen drain/reset batches, 1 MiB messages, Unicode/control strings, multiple drains, hostile getters/toString/Symbol.toPrimitive/proxies/revoked proxies, primitive throws, reentrant emission, later listeners, and recovery are covered.
- Validation: focused semantic module 24/24; bun run type-check; bun run lint; bun run fmt:check; bun run test:repository 130/130; bun run test:modules 1,037/1,037; bun run test:system 284/284; git diff --check. The serial browser lane was not rerun because this remediation only changes the headless semantic-context module; the previous reviewed browser validation remains applicable.
<!-- SECTION:NOTES:END -->
