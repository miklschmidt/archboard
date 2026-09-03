---
id: TASK-143.08.06.04
title: Hard-cut live session control into the browser command surface
status: In Progress
assignee:
  - '@codex'
created_date: '2026-09-02 01:58'
updated_date: '2026-09-03 09:39'
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
- [ ] #1 The released command inventory classifies every path as a board operation, browser operation, or neither, and only paths beneath `archboard browser` may require a connected browser client or inspect or manipulate pane, selection, focus, viewport, or displayed-board state.
- [ ] #2 Pane inventory and lifecycle, displayed-board changes, live selection reads, camera control, and capture of the current rendered session are available only through coherent `archboard browser ...` subcommands; their help states the connected-session prerequisite and visible effect.
- [ ] #3 Named-board rendering is a board operation that explicitly names the board and has no pane or camera option; browser capture explicitly names its live target and cannot be mistaken for persisted-board rendering.
- [ ] #4 No `board` command opens, selects, repoints, or creates a pane. Showing a named board is an explicit browser command, while creating and later addressing the board remain browser-free.
- [ ] #5 Every board write that targets elements requires explicit stable element identities or another board-domain selector. Promotion and demotion no longer fall back to live selection; `browser selection` exposes identities that callers may deliberately pass to a later board command.
- [ ] #6 Board inventory reports persisted-board facts only. Browser inventory reports panes and what they display; no `onScreen` or equivalent session field leaks into the board result contract.
- [ ] #7 Old top-level pane, panes, selection, viewport, and session-screenshot spellings and pane-changing board options are removed rather than aliased, and every removal produces concise replacement guidance.
- [ ] #8 The CommandContract registry and generated command audit enforce the classification: no board command carries a browser prerequisite or session input, no browser command writes a note, and all browser-requiring commands live under the browser namespace.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add an explicit board/browser/neither classification to every flattened CommandContract registry entry, validate namespace, prerequisite, effect, and session-option invariants, and emit the classification in the canonical audit and generated views.
2. Replace the old live-session paths with `browser panes`, `browser open`, `browser close`, `browser show`, `browser selection`, `browser viewport`, and `browser capture`. Require an explicit pane for show and capture, make help state the connected-browser requirement and visible effect, and provide concise migration errors for every removed spelling.
3. Remove `board open` and all pane/session fields from board inventory and board help. Keep `board new`, named rendering, and other persisted-board commands browser-free; keep browser show/capture read-only with respect to notes.
4. Require non-empty `--ids` for promote and demote, delete the selection fallback and its HTTP relationship, and make `browser selection` return the board plus stable element identities for deliberate reuse.
5. Update the authored command audit, derived contract expectations, focused CLI/board owners, and directly contradicted guidance. Delete obsolete alias and pane-coupled assertions instead of preserving compatibility.
6. Run only focused command-contract, package CLI, board-inventory, and live-session owners plus scoped Oxlint, Oxfmt, and diff checks. Record exact wall times and child/browser counts, leave all acceptance criteria unchecked, and commit the reviewable cut.

7. Rereview repair: make comparison side metadata and one-sided address discovery persisted-note-only; remove the stale browser-open board relationship; make the cheap registry/audit owner compare REST relationships; replace its duplicated architecture assertions with narrow render/capture and compare contract checks; and rerun only the two affected focused owners plus scoped formatting and lint.

8. Standards-review repair: resynchronize source panes from the persisted note after save-elsewhere, restore direct replacement/same-board observer assertions, keep persisted draft boards reachable in the navigator, make nested help resolve the selected contract in process with one package smoke, and correct zero-client renderer/Mermaid guidance.

9. Final-spec repair: remove obsolete source/loadedAt fields from all exact compare callers and public shapes; recompose navigator inventory whenever authoritative pane state changes so first-pane scratch is deterministic; correct persisted-only comments/audit fields; and rerun only focused compare owners, zero-client shape owner, scoped UI/static checks, and one capped navigator owner.

10. Resolve the confirmed save-elsewhere release race by carrying the exact human source holder through terminal hold resolution, releasing that holder synchronously after target persistence and before board_released/save completion, and keeping the browser release idempotent. Add the exact browser-free next-writer ordering assertion, replace the post-adoption synthetic move with trusted pointer input in the existing browser owner, then run only the affected owner slices and scoped static checks.

11. Extract the save-elsewhere recovery and post-adoption contention proof into its own exact-name browser case with a fresh owned canvas/browser. Keep the original broadcast-convergence case and delete the moved setup/assertions from it. The extracted case will create only the source scene needed for a note hold, assert source adoption and no repoint, acquire writer B directly after save, exercise the queued edit with a trusted pointer drag, and prove persistence after B releases. Run that exact case once under the 20-second TERM / 5-second KILL cap, then run only exact-file lint, format, and diff checks.

12. Keep the extraction under one file-level owned canvas/browser fixture so full-file execution still has one startup. Give each exact-name case its own board, reset only the browser fetch counters between cases, and cap every recovery wait at three seconds. The first case retains broadcast convergence; the second owns note-hold, save-elsewhere adoption, exact-holder release, and trusted-pointer queue persistence.
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
<!-- SECTION:NOTES:END -->
