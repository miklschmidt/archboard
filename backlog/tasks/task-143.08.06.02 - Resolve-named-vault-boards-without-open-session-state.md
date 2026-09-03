---
id: TASK-143.08.06.02
title: Resolve named vault boards without open-session state
status: In Progress
assignee:
  - '@codex'
created_date: '2026-09-02 01:58'
updated_date: '2026-09-03 05:40'
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
1. Preserve direct vault resolution and strict note-authority behavior for installed boards.
2. Keep the normalized board-key lock transaction as the single synchronous write boundary.
3. Stamp the exact committed note hash on the held lease, emit a single-use predecessor handoff on release, and expose it only to a waiter that observed that exact lease.
4. Reconcile an installed stale baseline only when the under-lock note hash exactly matches that proven predecessor; retain 409 behavior for every other foreign edit.
5. Extend the vault-only two-canvas owner so the waiter opens H0 before contention, then commits H2 after A commits H1; retain the foreign-byte conflict owner.
6. Run only focused vault/lock/write owners plus lint, format, diff checks, and a narrow type check if safe; commit cleanly and report to the parent without finalizing the task.
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

Review remediation:
- Creation now acquires the existing normalized cross-canvas board mutex before list/check/exclusive publication. One compact two-canvas owner proves case and NFC-equivalent spellings yield exactly one 200, one 409, and one persisted note.
- Write admission parses only the normalized lock key before waiting. The exact note is resolved, installed, and given its missing baseline after acquiring the lock. The production owner observes a waiter in /health activeMutations, lets the current holder commit version 1, then proves the waiter commits version 2 with both edits present.
- Pane observers now enter a per-board microtask queue after persistence. Invocation is outside response latency; commit scheduling is FIFO; synchronous throws and promise rejections are logged; unresolved promises do not block later notifications. The retained module owner uses a fake observer clock, checks one atomic writer call, persisted bytes, throw/reject handling, unresolved delivery, and order.
- Read-only resolution now returns an ephemeral note-backed BoardState and never installs the open registry. Explicit open, create, and write are the only installation paths. A read-then-open owner proves the listing stays closed and explicit open still reports vault.
- Compare preserves typed BOARD_RESOLUTION_FAILED missing responses with identical zero-pane/one-pane bodies. BOARD_REQUIRED now exposes available persisted keys instead of a misleading open field through domain, HTTP, and client surfaces.
- Board-new rejects retired pane input with actionable 400; valid creation separately proves unchanged pane state. New-board dialog placement is open-only, its shell handler has no pane field, and a static rendered component owner proves new omits the choice while open retains it.
Focused remediation validation: vault-only 6 tests/60 assertions in 2.11s; public refusals 6/60 in 2.24s; observer plus dialog 3/11 in 0.22s; preview 3/34 in 2.11s; branching 3/38 in 2.32s; lifecycle 6/48 in 1.38s; element writes 7/54 in 1.66s; pane addressing 7/55 in 4.49s; package CLI 6/109 in 3.54s; protected first-open 1/7, held reload 1/12, concurrent first-open 1/14; existing cross-process lock 1/17 in 16.91s. Scratch forced-death lifecycle remains excluded and unchanged.

Second-review repair:
- A successful note persist now stamps its exact hash on the enclosing lease token. Release emits a one-use handoff receipt containing that lease identity and hash; only an acquirer that previously observed the same id/process/since/token receives it, and every fresh acquirer consumes any receipt.
- Write admission advances an already-installed baseline only when its under-lock note load exactly matches that proven predecessor hash. Missing or mismatched proof keeps the existing BOARD_VERSION_CONFLICT path, so external bytes before release or before the waiter load are not laundered.
- The vault-only two-canvas owner now explicitly opens H0 in the waiting canvas before A holds and commits H1, then proves B commits H2 with both elements. The existing uncontended foreign-byte conflict remains 409 and preserves bytes.
Focused validation: vault-only 6 tests/61 assertions in 2.29s; board-version note 8/47 in 0.39s; post-commit observers 2/9 in 0.25s; focused Oxlint; focused Oxfmt; git diff --check. The excluded 16.9s legacy lock owner was not rerun. Task remains In Progress with all ACs unchecked for parent review.
<!-- SECTION:NOTES:END -->
