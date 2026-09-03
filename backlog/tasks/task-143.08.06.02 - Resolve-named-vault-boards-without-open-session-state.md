---
id: TASK-143.08.06.02
title: Resolve named vault boards without open-session state
status: In Progress
assignee:
  - '@codex'
created_date: '2026-09-02 01:58'
updated_date: '2026-09-03 05:13'
labels: []
dependencies:
  - TASK-143.08.06.01
  - TASK-143.08.04
references:
  - src/runtime/engine/board-store.ts
  - src/runtime/engine/board-io.ts
  - src/runtime/engine/board-target.ts
  - docs/adr/0015-the-vault-is-the-truth-and-the-agent-shape-is-input.md
  - docs/adr/0016-one-writer-at-a-time-per-board.md
  - docs/adr/0020-board-work-never-depends-on-a-browser-session.md
parent_task_id: TASK-143.08.06
priority: high
type: enhancement
ordinal: 266000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Make the persisted note, not transient server or browser registration, sufficient to address a board. Every content interface must resolve the explicit board key against the configured vault on demand and retain the existing synchronous read-modify-write and lock guarantees. Board creation becomes a persisted operation. Live panes are optional observers: successful commits may be broadcast to panes already showing the board, but pane availability, acknowledgement, disconnection, or backpressure cannot participate in the board transaction.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 With zero WebSocket clients and no prior board-open request, each existing named vault board is directly usable through representative read, query, change, inspection, branch, snapshot, import, export, and comparison production interfaces.
- [ ] #2 Creating a board atomically creates its canonical empty note, returns its persisted identity, and neither creates, selects, repoints, nor otherwise changes a browser pane.
- [ ] #3 A missing, ambiguous, malformed, or conflicting named note produces the same actionable domain refusal regardless of browser state; no command tells the caller to open a pane or board first.
- [ ] #4 Each board write still performs one synchronous locked read-modify-write against the note and returns the committed result; transient caches or registries cannot become an authority or create a second board document.
- [ ] #5 After commit, panes already showing the board can receive the resulting document, while no connected, disconnected, slow, or failing pane changes transaction success, ordering, latency bounds, or the persisted bytes.
- [ ] #6 Production-interface tests start with a vault-only note and zero browser clients, exercise the reachable success and failure states, and prove that direct board access preserves version, conflict, locking, and one-request-one-write invariants.
- [ ] #7 Changes at the canvas application boundary consume the recovered TASK-143.08.04 lifecycle owner unchanged; they add no Codex child startup, reload, restart, reaping, teardown, or application-phase logic, and application integration is serialized after that recovery task.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Move named-board resolution into board-io as the single vault-backed authority: normalize the explicit key, inspect persisted candidates for collisions and declared-name conflicts, parse the note, and install only a content-free BoardState address for existing callers. Keep missing, ambiguous, malformed, and conflicting outcomes in one typed domain refusal with no pane/open prerequisite.
2. Route application and code-target board lookups through that resolver. Establish the first write baseline once before lock acquisition, then retain the existing synchronous read-copy-mutate-atomic-write path. Leave TASK-143.08.04 lifecycle composition untouched.
3. Make board creation publish a canonical empty versioned note through exclusive atomic creation, register it only after commit, and return the persisted identity without resolving or changing a pane.
4. Keep pane notifications after persistence and make synchronous observer failures best effort so they cannot change the committed command result. Preserve per-pane delivery filtering and persisted bytes.
5. Add one compact production-interface owner seeded only with vault notes and zero WebSocket clients. Cover representative read/query/change/snapshot/import/export/branch/compare paths, atomic creation, typed resolution failures, version/conflict/lock/one-write behavior, and deterministic notification fakes. Update only directly contradicted retained assertions.
6. Run the focused board-resolution/public-interface owners, narrow lint/format/type checks where safe, and diff checks. Commit coherent conventional slices; leave TASK In Progress and all acceptance criteria unchecked.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implementation handoff:
- Added one vault-backed resolver beside board I/O. It normalizes explicit addresses, detects duplicate path identities and frontmatter conflicts, parses the exact persisted note, and registers only content-free board bookkeeping. Prepared board-open loads remain exact-load inputs to the recovered checkout lifecycle owner.
- New boards publish a canonical empty version-1 note through exclusive atomic creation before registry insertion; no pane parameter, selection, repoint, or browser acknowledgement participates.
- Write requests establish a first baseline before the existing per-board lock, then retain the synchronous read-copy-mutate-atomic-write path. Pane delivery is post-commit and synchronous observer exceptions are logged without changing the committed result.
- Added compact zero-WebSocket production-interface coverage (4 tests, 44 assertions) and deterministic throwing/unresolved observer coverage (2 tests, 4 assertions). Updated only directly contradicted board lifecycle, HTTP refusal, CLI schema/audit, generated-proof hash, and scratch malformed-note assertions.
Validation passed: vault-only production interfaces; board write observers; board lifecycle; public HTTP refusals; element writes; branching pane effects; cross-process board lock (16.85s); CLI board commands; CLI schemas; CLI command audit; generated artifact reproducibility; focused Oxlint; focused Oxfmt; git diff --check; recovered checkout lifecycle owners for first-open, held reload, and concurrent first-open.
Excluded risk: scratch-board owner passes 3/4, but its forced-death restart fails in the recovered TASK-143.08.04 Codex-root lifecycle with locked/colliding owner roots. No protected lifecycle code was changed. A narrow standalone TypeScript invocation reaches two existing unrelated diagnostics in codex-protocol response schemas and runtime/engine/git.ts; it reports no changed-file diagnostic.
Task intentionally remains In Progress with all acceptance criteria unchecked for parent review.
<!-- SECTION:NOTES:END -->
