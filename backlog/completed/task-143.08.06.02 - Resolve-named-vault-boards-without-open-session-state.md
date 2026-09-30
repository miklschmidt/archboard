---
id: TASK-143.08.06.02
title: Resolve named vault boards without open-session state
status: Done
assignee:
  - '@codex'
created_date: '2026-09-02 01:58'
updated_date: '2026-09-03 05:56'
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
- [x] #1 With zero WebSocket clients and no prior board-open request, each existing named vault board is directly usable through representative read, query, change, inspection, branch, snapshot, import, export, and comparison production interfaces.
- [x] #2 Creating a board atomically creates its canonical empty note, returns its persisted identity, and neither creates, selects, repoints, nor otherwise changes a browser pane.
- [x] #3 A missing, ambiguous, malformed, or conflicting named note produces the same actionable domain refusal regardless of browser state; no command tells the caller to open a pane or board first.
- [x] #4 Each board write still performs one synchronous locked read-modify-write against the note and returns the committed result; transient caches or registries cannot become an authority or create a second board document.
- [x] #5 After commit, panes already showing the board can receive the resulting document, while no connected, disconnected, slow, or failing pane changes transaction success, ordering, latency bounds, or the persisted bytes.
- [x] #6 Production-interface tests start with a vault-only note and zero browser clients, exercise the reachable success and failure states, and prove that direct board access preserves version, conflict, locking, and one-request-one-write invariants.
- [x] #7 Changes at the canvas application boundary consume the recovered TASK-143.08.04 lifecycle owner unchanged; they add no Codex child startup, reload, restart, reaping, teardown, or application-phase logic, and application integration is serialized after that recovery task.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Preserve the exact observed-predecessor handoff and H0 to H1 to H2 success path.
2. Make the exported post-commit lease stamp best-effort: catch and log proof-metadata I/O failure without changing the committed response or note bytes.
3. Exercise the existing public lock and board-I/O seams with fake time and local derived lock files; add no process lane or content authority.
4. Add one consolidated negative table covering absent or malformed proof, identity mismatch, note-hash mismatch, replay, stamp failure, and an intermediate-acquirer window; every case must refuse proof or baseline adoption and consume derived metadata.
5. Run only the compact proof owner, existing vault-only and note-conflict owners, focused lint and format, and diff checks. Keep the task In Progress with ACs unchecked, commit cleanly, and callback the parent.
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

Final Spec rereview repair:
- recordLockCommit is now best-effort at its exported boundary. Any auxiliary lock-record read, temp write, or rename failure is logged and returns false after the canonical note commit; it cannot replace the successful committed answer with a 500. A missing stamp leaves no receipt and can only make a later writer take the existing safe conflict path.
- The existing fast write owner injects a lock-record rename failure after one atomic version-2 note write. The answer remains successful, persisted version and bytes match, the proof write logs once, no receipt exists, and a stale baseline still receives BoardWriteConflictError without another atomic write or byte change.
- One deterministic fake-time table covers seven concrete variants in six requested groups: absent and malformed receipts, lease-identity mismatch, external-byte hash mismatch, consumed receipt replay, stamp failure, and an intermediate acquirer. Invalid metadata is consumed or absent, different bytes are never adopted, and no process lane was added.
Red/green evidence: with the previous throwing recordLockCommit body restored, the focused post-commit assertion failed at the injected lease rename after note persistence; restoring best-effort handling made it pass. Final focused validation: write/proof owner 4 tests/60 assertions in 0.29s; vault-only H0-H1-H2 owner 6/61 in 2.06s; note-conflict owner 8/47 in 0.34s; focused Oxlint and Oxfmt check; git diff --check. Total focused wall time was about 2.3s in parallel. The 16.9s legacy lock lane was not run. Task remains In Progress with all ACs unchecked for parent review.

Clarification: an absent or unreadable current lease keeps the existing silent false result from readRecord. The new catch logs auxiliary mkdir, temp-write, and rename exceptions. The injected regression is the reviewed post-commit rename failure.

Finalization evidence: independent Standards and Spec reviews of b96e33da4081bb3f7832c77e35429ffd51c94fe1..c41f83203ab8bde379a821aaea5c10067f2b93eb both reported REVIEW_CLEAN. Focused production evidence proves direct persisted-note addressing without browser clients across read/query/change/inspection/branch/snapshot/import/export/compare; atomic normalized creation; truthful browser-independent refusals; locked synchronous writes and safe post-response FIFO observers; and unchanged recovered lifecycle ownership. Final repair focused owners: write/proof 4 tests/60 assertions (0.29s), vault-only H0-H1-H2 6/61 (2.06s), note-conflict 8/47 (0.34s), focused Oxlint/Oxfmt, and git diff --check. The legacy 16.9s lock owner was not required for the final repair and was not rerun by reviewers.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Resolved persisted named boards independently of open browser sessions. Integrated the reviewed linear four-commit range and verified all acceptance criteria from focused production-interface, lock/proof, observer, refusal, and recovered-lifecycle evidence; the final repair did not rerun the legacy 16.9s lock owner.
<!-- SECTION:FINAL_SUMMARY:END -->
