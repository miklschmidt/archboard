---
id: TASK-130.08
title: Convert canvas state and session checks to native system tests
status: To Do
assignee: []
created_date: '2026-08-28 01:04'
updated_date: '2026-08-28 06:12'
labels: []
dependencies:
  - TASK-130.01
  - TASK-086
  - TASK-130.06
references:
  - scripts/check-branch-compare.mjs
  - scripts/check-changes.mjs
  - scripts/check-doing.mjs
  - scripts/check-hot-reload.mjs
  - scripts/check-side-by-side.mjs
  - scripts/check-staleness.mjs
  - scripts/check-version.mjs
  - TASK-086
parent_task_id: TASK-130
priority: medium
type: task
ordinal: 143000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Convert the non-browser checks for branch comparison, change feeds and injection, doing, hot reload, side-by-side panes, staleness, and board versions. These tests share canvas lifecycle and session mechanics but assert distinct public state transitions.

Reuse the completed TASK-086 lifecycle only where a test owns the same canvas process. Preserve the hot-reload kept-state boundary and injection safety rather than simplifying the tests into in-process mocks.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 check-branch-compare, check-changes, check-doing, check-hot-reload, check-side-by-side, check-staleness, and check-version are replaced by typed native system tests grouped by public behavior.
- [ ] #2 Change-feed tests preserve ordering, cursor behavior, injection opt-in, loopback refusal, configured task routing, and the rule that an agent never receives its own injected drawing.
- [ ] #3 Doing and version tests preserve write-boundary narration requirements, real board versions, single stale refusal, actionable conflict output, and unchanged note bytes on refusal.
- [ ] #4 Hot-reload tests preserve kept state, deliberate canary failure, terminal and tab reporting, pane registrations, socket count, feed cursor, and the one unsaved-board exception.
- [ ] #5 Branch and side-by-side tests preserve board identity, variant routing, pane identity, operation order, exact compare results, and unchanged unrelated boards.
- [ ] #6 Owned canvas processes use the TASK-086 lifecycle; every test restores environment state and leaves no process, listener, socket, port, vault, or temporary branch on success or failure.
- [ ] #7 Every test source file is at most 500 lines and representative state-ordering, reload, stale-write, injection, and variant-routing regressions fail the native coverage before legacy deletion.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Dependencies, integration gate, and public boundary. Keep TASK-130.01 and completed TASK-086, and add TASK-130.06 as an explicit dependency. Disjoint native authoring may overlap on its exact paths after TASK-130.01/TASK-086, but task completion and reconciliation wait for TASK-130.06 so every ordinary canvas process imports the single typed tests/system/support/owned-canvas.ts lifecycle. Do not add a declaration shim, copy that helper, or change product behavior. Module-owned tests import only public src/runtime/engine root entrypoints; system tests use bin.archboard, public HTTP/WebSocket behavior, and the public dev-canvas process. TASK-130.11 owns final lane names and final suite documentation, not these seven predecessor deletions.

2. Exact module-owned mapping under src/runtime/engine/tests:
- scripts/check-changes.mjs pure semantic cases -> changes-semantics.test.ts, changes-layout.test.ts, and change-feed.test.ts.
- scripts/check-version.mjs note and diagnosis cases -> board-version-note.test.ts and board-version-conflict.test.ts.
changes-semantics.test.ts exclusively owns anonymous versus promoted metadata, the 12-pixel insignificant nudge, structural cut/reroute/add/promote classification, cosmetic suppression, and exact narration. changes-layout.test.ts exclusively owns bound-label drift, cluster leave/enter, region movement, frame bounds, whole-board panning, wholesale rearrangement, and exact named versus anonymous output. change-feed.test.ts exclusively owns human/agent origin, 30-update coalescing, explicit settlement, baseline deep copies, cursor net diffs, unreachable cursor null, cosmetic silence, and wholesale baseline adoption.
board-version-note.test.ts exclusively owns note frontmatter version 1 and increments, head-only reads, same-document byte identity, stated/remembered precedence, invalid human version preservation, and no version from current note alone. board-version-conflict.test.ts exclusively owns unchanged/behind/ahead/unknown moves, foreign-write versus revert/ahead diagnoses, exact messages and structured numbers, note-watch marks, and test cleanup of remembered versions and watches.

3. Exact tests/system-owned mapping under tests/system/canvas-state:
- scripts/check-branch-compare.mjs -> branch-compare.test.ts and the branch half of variant-eval-contracts.test.ts.
- scripts/check-side-by-side.mjs -> side-by-side.test.ts and the side-by-side half of variant-eval-contracts.test.ts.
- scripts/check-changes.mjs injection cases -> injection.test.ts.
- scripts/check-doing.mjs -> doing-boundary.test.ts and doing-activity.test.ts.
- scripts/check-hot-reload.mjs -> hot-reload.test.ts.
- scripts/check-staleness.mjs -> staleness-source.test.ts and staleness-frontend.test.ts.
- scripts/check-version.mjs real-canvas cases -> board-version-route.test.ts and board-version-client.test.ts.
branch-compare.test.ts owns source save, copied identity, exact comparable/shared/added/removed/unchanged counts and order, redraw and independent-board negative controls, multipart stencil promotion, swept-arrow promotion, describe bytes, and unchanged unrelated source. side-by-side.test.ts owns the cold CLI trace, palette-before-draw ordering, branch save moving no pane, explicit new-pane display, two-pane capacity refusal, pane-targeted screenshot, proposal-only writes, compare output, source staying in its original pane, and the board-open negative control. variant-eval-contracts.test.ts owns only eval ids 5 and 7 grader paths and the objective expected-output references; it does not repeat branch or pane behavior.

injection.test.ts owns non-loopback refusal, opt-in switch, explicit thread routing, exact app-server protocol without jsonrpc, quiet versus loud delivery, 150 ms debounce/minimum interval behavior, self-injection refusal even with doing, one human delivery, and exact board/doing context. doing-boundary.test.ts owns the missing-doing refusal exclusively: all current write routes, blank/whitespace/paragraph limits, DOING_REQUIRED status/body, CLI global flag/help, claim reason not substituting for a write line, refusal non-mutation, human report exemption, and Save/Clear human authority. Missing-doing must not appear in TASK-130.06 public-http-refusals. doing-activity.test.ts owns pane broadcasts, board/by/kind fields, other-board notification, no activity for refused writes, recent five oldest-first, repeated-line collapse, late-pane replay, and the exact absence of doing data from element/note bytes.

hot-reload.test.ts owns source-save silence, stale indication/remedy, explicit reload in the same PID, port/socket/pane/unsaved element/feed id/cursor preservation, exactly-once post-reload broadcast, the one unsaved-board canary exception, deliberate scratch-store loss, exact terminal and tab failure reports, and plain start non-reloadability. staleness-source.test.ts owns evaluated time/newest source, quiet status, touched-source loud status, unchanged PID, JSON/stderr wording, restart remedy and pane cost, with exact mtime restoration. staleness-frontend.test.ts owns served bundle identity and stale/current/Vite/unnamed pane registration responses. board-version-route.test.ts owns returned fingerprint/version/hash, stated precondition acceptance, stale refusal with unchanged bytes and current document/version, invalid expectation usage, no-note null version, non-specialized route coverage, and CLI exit 5 versus usage exit 2. board-version-client.test.ts owns claim-seeded expectations, told-once stale recovery, long-lived client memory, stated override, human non-refusal, and foreign-note hash refusal with exact untouched bytes.

4. Same-owner support and lifecycle rules. Add tests/system/canvas-state/support/http.ts for typed request/response capture, doing query attachment, liveness checks, and bounded condition polling; pane-session.ts for typed pane registration and event capture; injection-daemon.ts for the exact Unix-socket protocol double; and reversible-checkout-edit.ts for byte/mtime snapshots, exact restore, and unchanged git-status proof. These are mechanics only: statuses, bodies, event order, messages, bytes, and timing margins stay in owning tests. Ordinary process tests import TASK-130.06 owned-canvas.ts directly. hot-reload.test.ts is the sole exception because bun --hot is the behavior under test: its test-local typed process owns the exact dev-canvas command, PID/health verification, stderr, bounded termination, and restoration; it is not exported or reused as a second general lifecycle. Every test, support, and authored TS fixture remains at or below 500 physical lines. No general state/session framework or mutable shared fixture exists.

5. Protected contracts. Preserve exact compare counts and narration order; source and proposal note bytes; two-pane identity and operation order; change-feed origin, cursor, baseline, and injection routing; missing-doing statuses/bodies and recent-five order; the hot reload 300 ms shortened settle window and every production duration imported from src/shared/timing/timing.ts; condition-based reload/staleness waits with named margins; source bytes and mtimes; all version/hash/frontmatter bytes and conflict output. No fixed wait becomes a product timing claim. The hot test runs alone, never alongside another test or a formatter/type checker, because it temporarily edits src/server.ts, src/runtime/engine/board-store.ts, and src/server/canvas/lib/application.ts and restores captured bytes in finally.

6. Red and parity proof. Keep all seven legacy scripts while native files are authored. In disposable checkouts, prove old/new failure for: redraw a proposal instead of branching; repoint the source pane; reorder or drop a feed event; permit missing doing; inject an agent's own change; clear one kept value on reload; suppress the deliberate canary; hide a stale source or stale bundle; accept a stale board version; and write after a refused precondition. Capture exact stdout/stderr/status/body/note and event-order parity for representative success and refusal cases. Run the hot deliberate-regression proof only in its disposable checkout and verify source bytes, mtimes, process, socket, state dir, and vault are restored before deletion.

7. Serialized package, eval, and deletion cutover. Once parity is recorded, the reconciliation owner performs one integration:
- Map package.json test:changes to bun test src/runtime/engine/tests/changes-semantics.test.ts src/runtime/engine/tests/changes-layout.test.ts src/runtime/engine/tests/change-feed.test.ts tests/system/canvas-state/injection.test.ts.
- Map test:doing to bun test tests/system/canvas-state/doing-boundary.test.ts tests/system/canvas-state/doing-activity.test.ts.
- Map test:branch to bun test tests/system/canvas-state/branch-compare.test.ts tests/system/canvas-state/variant-eval-contracts.test.ts.
- Map test:side-by-side to bun test tests/system/canvas-state/side-by-side.test.ts.
- Map test:staleness to bun test tests/system/canvas-state/staleness-source.test.ts tests/system/canvas-state/staleness-frontend.test.ts.
- Map test:hot to bun test tests/system/canvas-state/hot-reload.test.ts.
- Map test:version to bun test src/runtime/engine/tests/board-version-note.test.ts src/runtime/engine/tests/board-version-conflict.test.ts tests/system/canvas-state/board-version-route.test.ts tests/system/canvas-state/board-version-client.test.ts.
- Update skills/archboard/evals/evals.json after TASK-130.05: replace ids 5 and 7 graded_by paths and their expected-output references with branch-compare.test.ts and side-by-side.test.ts; replace those two paths in eval 8 files while retaining TASK-130.05 completion-contract.test.ts.
- Delete scripts/check-branch-compare.mjs, check-changes.mjs, check-doing.mjs, check-hot-reload.mjs, check-side-by-side.mjs, check-staleness.mjs, and check-version.mjs.
Do not land native files before this atomic mapping/deletion/eval cutover. The real TASK-130.02 inventory must remain green and reach every new file exactly once.

8. Exact focused validation, in this order:
bun test src/runtime/engine/tests/changes-semantics.test.ts src/runtime/engine/tests/changes-layout.test.ts src/runtime/engine/tests/change-feed.test.ts src/runtime/engine/tests/board-version-note.test.ts src/runtime/engine/tests/board-version-conflict.test.ts
bun test tests/system/canvas-state/injection.test.ts tests/system/canvas-state/doing-boundary.test.ts tests/system/canvas-state/doing-activity.test.ts tests/system/canvas-state/branch-compare.test.ts tests/system/canvas-state/variant-eval-contracts.test.ts tests/system/canvas-state/side-by-side.test.ts tests/system/canvas-state/staleness-source.test.ts tests/system/canvas-state/staleness-frontend.test.ts tests/system/canvas-state/board-version-route.test.ts tests/system/canvas-state/board-version-client.test.ts
bun test tests/system/canvas-state/hot-reload.test.ts
Run the hot command alone only after the preceding command exits, then verify git status and source byte/mtime restoration. Next run bun run type-check, bun run lint, bun run fmt:check, bun run check, and git diff --check sequentially. Eventual categories are module for src/runtime/engine/tests and system for tests/system/canvas-state; TASK-130.11 owns final package names.

9. Overlap and merge boundary. Exact native filenames are disjoint from TASK-130.03/.04/.05/.09/.10 even where src/runtime/engine/tests is a shared directory. tests/system/support/owned-canvas.ts is read-only here and owned by TASK-130.06. package.json overlaps every predecessor; skills/archboard/evals/evals.json overlaps TASK-130.05; both are edited only during serialized reconciliation. Author .08 and .09 in parallel only on their disjoint native paths after TASK-130.01/TASK-086; because TASK-130.06 is an explicit dependency of both, neither task completes or enters reconciliation until .06 is integrated, then integrate .08 and .09 one at a time with full validation. TASK-130.10 waits for .06/.08/.09, and TASK-130.11 is last.
<!-- SECTION:PLAN:END -->
