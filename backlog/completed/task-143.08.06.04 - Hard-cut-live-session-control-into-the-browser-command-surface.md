---
id: TASK-143.08.06.04
title: Hard-cut live session control into the browser command surface
status: Done
assignee:
  - '@codex'
created_date: '2026-09-02 01:58'
updated_date: '2026-09-03 10:05'
labels: []
dependencies:
  - TASK-143.08.06.02
  - TASK-143.08.06.03
references:
  - src/cli/command-contract/contract.ts
  - src/cli/commands/run.ts
  - docs/design/cli-command-audit.json
  - docs/adr/0008-cli-is-the-default-surface.md
  - docs/adr/0009-every-call-names-its-board.md
  - docs/adr/0020-board-work-never-depends-on-a-browser-session.md
parent_task_id: TASK-143.08.06
priority: high
type: enhancement
ordinal: 268000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Make the public command boundary teach the architecture. Persisted-board work remains in explicit named-board commands. Every command whose purpose is to inspect or manipulate the connected user session moves beneath `archboard browser`, including panes, displayed boards, selection, camera, and capture of what the person currently sees. Remove the old spellings in the same cutover so compatibility aliases cannot preserve two overlapping mental models. Keep named-board server rendering distinct from browser capture.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The released command inventory classifies every path as a board operation, browser operation, or neither, and only paths beneath `archboard browser` may require a connected browser client or inspect or manipulate pane, selection, focus, viewport, or displayed-board state.
- [x] #2 Pane inventory and lifecycle, displayed-board changes, live selection reads, camera control, and capture of the current rendered session are available only through coherent `archboard browser ...` subcommands; their help states the connected-session prerequisite and visible effect.
- [x] #3 Named-board rendering is a board operation that explicitly names the board and has no pane or camera option; browser capture explicitly names its live target and cannot be mistaken for persisted-board rendering.
- [x] #4 No `board` command opens, selects, repoints, or creates a pane. Showing a named board is an explicit browser command, while creating and later addressing the board remain browser-free.
- [x] #5 Every board write that targets elements requires explicit stable element identities or another board-domain selector. Promotion and demotion no longer fall back to live selection; `browser selection` exposes identities that callers may deliberately pass to a later board command.
- [x] #6 Board inventory reports persisted-board facts only. Browser inventory reports panes and what they display; no `onScreen` or equivalent session field leaks into the board result contract.
- [x] #7 Old top-level pane, panes, selection, viewport, and session-screenshot spellings and pane-changing board options are removed rather than aliased, and every removal produces concise replacement guidance.
- [x] #8 The CommandContract registry and generated command audit enforce the classification: no board command carries a browser prerequisite or session input, no browser command writes a note, and all browser-requiring commands live under the browser namespace.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Hard-cut browser-session behavior into `archboard browser`, retain explicit named-board operations, remove compatibility spellings and pane-changing board options, and enforce the boundary through CommandContract/audit and focused contracts, HTTP, observer, and browser tests.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implementation handoff (2026-09-03): hard-cut all live session operations beneath browser (panes/open/close/show/selection/viewport/capture); removed top-level spellings and board open with migration guidance; added board/browser/neither registry classification and executable architecture assertions; made promotion/demotion require explicit ids; made board inventory persisted-only; removed pane movement and session fields from board-save responses; and adapted the shell to compose persisted inventory with /api/panes locally. Canonical audit reviewedBase is dfb589bd28f6dc95289f5271ba389bfcc48bafbe; derived proof artifacts remain ignored and reproducible.

Focused validation: 43 command-contract/package owners passed in 26.84s (0 real-browser children); side-by-side, vault-only inventory, public refusals, checkout consistency, socket ownership, branching pane effects, pane addressing, repository session, held save-elsewhere, and 12 shell unit checks passed in focused runs. Scoped Oxfmt, Oxlint, git diff --check, and untracked-file audit passed. No broad suite, root type-check, build, or real-browser lane was run, per delegation. Rendered navigator verification therefore remains for integration review. Additional unrelated owner failures observed while probing were the existing held-copy reread inconsistency, a Codex startup lock collision in the forced-death scratch owner, and malformed legacy open returning 422 where its owner expects 400.

Clarification: those three probe failures are outside this task surface; this delegation did not rerun the fixed base, so their baseline status is unconfirmed.

Rereview remediation: comparison now reads and discovers only persisted notes and omits transient source/onScreen fields; browser open declares only pane-open REST work; the canonical audit now exactly matches every declared REST relationship; nested help resolves the selected child contract and states its prerequisites/effects; save-elsewhere carries the fresh source-note document on board_released so source panes replace held content without changing address; branch and same-board observer deltas are asserted again; draft-probe remains reachable; README, TESTING, and the tracked skill teach zero-client render/Mermaid behavior. Focused audit, help/argv, artifact, comparison geometry, vault-only, branching, save-elsewhere, frontend build, scoped lint, and scoped format checks pass. The full held-board owner retains its pre-existing excluded held-copy reread failure. The one authorized board-navigator browser run completed in 8.28s: the repaired six-board/draft-probe scenario passed, while the separate empty-state target-count assertion expected 5 and observed 4; no rerun or cap widening was performed. TASK remains In Progress and all acceptance criteria remain unchecked for full rereview.

Review correction: parent standards review confirmed the held-copy reread, forced-death Codex lock collision, and malformed legacy open 422/400 failures are identical at immutable BASE and prior HEAD. They remain explicitly out of scope and untouched.

Final-spec repair at pre-commit HEAD: removed remaining compare source/loadedAt session fields and corrected the audit schema; refreshes the navigator only after an authoritative pane board registration is accepted; restored held save-elsewhere source elements/files in the same pane without board_switched; resets the discarded reporting generation and releases the pane gesture lock on recovery; corrected operator copy and added real-browser source/destination assertions.\n\nFocused green: changes-semantics (6), metadata-tracking (1), geometry-consumers (1), vault-only-production-interfaces (6), command-contract-audit (9), command-contract-artifacts (4), change-reporting-holds-and-adoption (5), exact-file oxlint, exact-file oxfmt, and frontend build. Board navigator passed both browser cases (2 tests, 63 assertions) under the 20s cap, including the former first-pane race.\n\nBlocked evidence: the focused human-hold browser owner reached and passed the new save-elsewhere assertions (35 assertions before its later scenario), then its legacy post-recovery mutex scenario either returned 409 or exceeded the mandatory 20s cap. The focused held-board-recovery owner also had one unrelated held-copy visibility failure (6 pass, 1 fail). Browser retries were stopped; all retained run-owned browser processes were terminated and verified absent. Task remains In Progress; no ACs or DoD items were checked.

Release-order remediation at 88cb018684fcd5c848cf940bd88b0c19bc7a950c: the write boundary now carries its exact source LockHolder through terminal held-board resolution, releases only that human holder after target persistence and commit stamping, then queues board_released; the pane release remains idempotent best effort. The browser-free ordering owner proves human B acquires the source immediately after human A receives a successful save-elsewhere response, with no polling or pane callback.

Focused green: exact next-writer held-board owner (1 test, 8 assertions), existing save-elsewhere source-document owner (1 test, 16 assertions), board-write observer owner (4 tests, 60 assertions), and exact-file Oxlint/Oxfmt/diff checks. The one permitted real-browser run built the frontend and entered human-hold-persistence, then reached the mandatory 20-second TERM / 5-second KILL cap before emitting an assertion result (exit 137); it was not rerun. The capped run left 12 agent-browser/Chromium processes, all terminated; the exact /tmp/ab-lane-S4w69J namespace was removed. Task remains In Progress and all acceptance criteria remain unchecked.

Final proof extraction at pre-commit HEAD: human-hold-persistence now has two exact-name cases sharing one file-level canvas/browser fixture. The broadcast case no longer carries note-conflict or recovery setup. The new one-element recovery case proves the old pane holder blocks B before save, asks save-elsewhere through the public API, requires B to acquire directly after the successful response, compares the adopted page document/files to the authoritative source, checks the held image/file reached only the saved copy, uses the trusted pointer drag while B owns the mutex, and checks the queued report persists after release without changing the pane address. Full-file startup cost stays one canvas and one browser: test count changes 1 to 2, startup count stays 1 to 1.

Focused execution did not complete. Attempt 1 failed in 123 ms before browser startup because the manually isolated runner environment lacked its child TMPDIR; that empty namespace was removed. The one permitted retry started one canvas and one browser, reached save-elsewhere in about 2.2 seconds according to the exact canvas log, then the compound recovery predicate ran until the outer TERM cap at 20.085 seconds with no assertion result. No third run was made. After that evidence, the compound default-timeout poll was replaced by one three-second wait for the concrete source element followed by direct per-contract assertions; the remaining extracted waits are capped at three seconds and the test itself at ten seconds. Scoped Oxlint, Oxfmt, max-lines, and diff checks pass. Exact run-owned browser processes and /tmp namespaces were removed. TASK remains In Progress and all acceptance criteria remain unchecked; completed browser proof is still blocked by the run limit.

Save-elsewhere baseline repair at pre-commit HEAD: after target persistence succeeds, terminal held-source recovery reads the authoritative source note, requires its exact source file/hash/version, records that tuple through board-store recordBaseline, then releases the exact human source lease and queues board_released. The existing held-board recovery case now immediately submits an identified-human source write and proves 200, no held response, and persistence through both source-note bytes and public GET. Focused API proof: 1 pass, 7 filtered, 20 assertions, 1.215s wall, no browser owner. Exact browser proof through the canonical adapter: 1 pass, 1 filtered, 38 assertions, 4.505s wall; 1 frontend build, 1 Bun owner, 1 canvas, 1 browser session, and the adapter cleanup audit retained 0 owned processes/listeners/sockets. Exact-file Oxfmt, Oxlint, and diff checks pass. TASK remains In Progress and all acceptance criteria remain unchecked.

Final standards repair at pre-commit HEAD: prepareBoard now waits first for authoritative server pane state, then for the focused rendered pane title to name the requested board together with that board's expected scene sentinel. The recovery board uses unique sentinel `recovery-auth`, so the prior live-session scene cannot satisfy the client-adoption condition; hold counters reset only afterward. The complete focused human-hold browser owner passed both cases in sequence: 2 tests, 57 assertions, 4.835s wall, 0 frontend builds, 1 Bun owner, 1 canvas, 1 browser session, and 0 retained owned processes/listeners/sockets after adapter audit. TASK-136 contamination was removed through Backlog CLI by restoring its plan and notes from fixed base dfb589bd; it remains Done with all 7 ACs checked and its final summary unchanged. TASK-143.08.06.04 remains In Progress with all 8 ACs unchecked.

Finalized against reviewed range dfb589bd..f93fe79e. Two independent final Standards and Spec reviews were REVIEW_CLEAN. Accepted verification: 59 classified command paths; browser prerequisites/session relationships only under browser; browser commands make no note writes and board commands consume no session state; focused command/package/contracts, production HTTP, observer, module/static owners passed; zero-client compare/render/Mermaid and persisted-only inventory contracts passed; API save-elsewhere baseline 1 pass/20 assertions (1.215s); exact recovery browser selector 1 pass/1 filtered/38 assertions (4.505s); shared-fixture browser owner 2 pass/57 assertions (4.835s), one owner/canvas/browser, no build or retained resources. Scoped lint/format/diff clean. Broad root TSC, whole suites, and full browser lane intentionally not rerun.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Hard-cut live-session commands into `archboard browser` while keeping named-board work browser-free, removing legacy spellings, and enforcing the boundary in the command audit. Verified by accepted focused contracts/HTTP/observer checks, zero-client and persisted-inventory contracts, targeted recovery and shared-fixture browser evidence, and independent clean Standards and Spec reviews.
<!-- SECTION:FINAL_SUMMARY:END -->
