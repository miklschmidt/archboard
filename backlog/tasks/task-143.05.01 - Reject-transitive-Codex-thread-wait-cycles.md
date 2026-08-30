---
id: TASK-143.05.01
title: Reject transitive Codex thread wait cycles
status: Done
assignee:
  - '@codex'
created_date: '2026-08-30 15:07'
updated_date: '2026-08-30 19:23'
labels: []
dependencies:
  - TASK-143.01.01
references:
  - docs/design/desktop-app-server-sharing-research.md
modified_files:
  - src/runtime/codex-wait-graph
parent_task_id: TASK-143.05
priority: high
type: task
ordinal: 184000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Own the pure lifetime-scoped wait-for graph in `src/runtime/codex-wait-graph`. It receives child/caller/turn/call and target identities and decides whether a dynamic operation may wait.

Delegation profile: gpt-5.6-luna, max.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Adding an edge set succeeds only when the resulting directed graph is acyclic and otherwise returns the exact inspectable cycle path.
- [x] #2 Direct self-wait, two-node, three-node, and longer transitive cycles are refused before any app-server dispatch.
- [x] #3 Settle, decline, cancellation, interruption, disconnect, and child exit remove only the owned edges; module tests prove no stale edge or cross-child collision.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Define the public module-root contract for branded ChildId, ThreadId, TurnId, and DynamicToolCallId values: a full edge owner, a target edge set, accepted/cycle insertion results with an inspectable path, deterministic snapshots, and six explicit cleanup causes; keep transport and dispatch out of the module. 2. Implement an explicit factory with closure-owned state, namespace graph vertices by ChildId, canonicalize target sets without mutating callers, and evaluate a prospective same-owner replacement atomically with deterministic traversal before committing it. 3. Implement exact-owner release for settle, decline, cancellation, interruption, and disconnect, plus child-scoped exit cleanup; return removed edges for inspection and preserve all unrelated registrations. 4. Add module-root contract tests for multi-target insertion, deterministic edge order, direct/two/three/long transitive cycles and exact closed paths, all six cleanup causes, overlapping owners, stale cleanup, same-owner replacement, and cross-child isolation. 5. Run focused module tests, strict type checking, lint, format, boundary and module-scope repository checks, git diff --check, and a complete BASE..HEAD path audit; record evidence in leaf notes.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented src/runtime/codex-wait-graph as a pure explicit factory. The public root exposes branded child/thread/turn/call ownership, canonical target edge sets, atomic same-owner replacement, deterministic closed cycle paths, inspectable edges, exact-owner cleanup for settle/decline/cancellation/interruption/disconnect, and child-scoped exit cleanup. Internal graph vertices are child-namespaced so identical server thread strings cannot collide across child lifetimes; no app-server or transport code is present. Tests cover multi-target insertion, exact ordering, direct/two/three/long transitive cycles, atomic refusal, all six cleanup causes, stale cleanup, overlapping owners, and cross-child isolation. Validation: bun test --isolate src/runtime/codex-wait-graph (11 tests, 75 expectations); bun run test:modules (452 tests, 3,375 expectations); bun run type-check; bun run lint; bun run fmt:check; bun test --isolate tests/system/repository-policy/boundaries.test.ts (9 tests, 76 expectations); bun test --isolate tests/system/repository-policy/module-scope-policy.test.ts (8 tests, 11 expectations); git diff --check. bun install restored missing declared dependencies and produced no tracked changes.

Root reconciliation validation at integration commit 0fbf497fb2ffc84c18a513dc5443343c4ef16696 repeated the 11-test/75-expectation contract, strict root/frontend type checks, lint and format, 17 boundary/module-scope tests, and the complete module lane. Independent review returned REVIEW_CLEAN after direct probes for failed multi-target atomicity, shared-edge owners, repeated cleanup, cross-child overlap, target-order determinism, and frozen inspection/cycle output.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added a lifetime-scoped pure Codex wait-for graph that atomically rejects direct and transitive cycles with deterministic inspectable paths. Exact owner cleanup covers settle, decline, cancellation, interruption, disconnect, and child exit without deleting overlapping or cross-child waits. Focused, type, lint, format, module-scope, boundary, and full module validation passed under independent review.
<!-- SECTION:FINAL_SUMMARY:END -->
