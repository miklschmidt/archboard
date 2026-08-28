---
id: TASK-130.10
title: Convert the four browser checks to one typed serial lane
status: To Do
assignee: []
created_date: '2026-08-28 01:05'
updated_date: '2026-08-28 05:41'
labels: []
dependencies:
  - TASK-130.01
  - TASK-086
  - TASK-130.06
  - TASK-130.08
  - TASK-130.09
references:
  - scripts/check-fixed-point.mjs
  - scripts/check-human-edit-performance.mjs
  - scripts/check-live-session.mjs
  - scripts/check-typed-text.mjs
  - docs/agents/test-suite.md
  - TASK-086
  - 'https://bun.com/blog/bun-v1.4#bun-test'
parent_task_id: TASK-130
priority: high
type: task
ordinal: 145000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Convert fixed-point, human-edit performance, live-session, and typed-text checks only after the non-browser process lanes have established typed lifecycle patterns. These are the four checks that drive a real renderer and must never share the machine concurrently.

Use native Bun assertions inside the browser tests, with one small typed command adapter for prerequisite detection, frontend build reuse, and the documented could-not-run exit. Do not use Bun file parallelism for this lane.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 check-fixed-point, check-human-edit-performance, check-live-session, and check-typed-text are replaced by typed Bun tests reached only through one explicitly sequential browser lane.
- [ ] #2 The lane refuses to claim a pass without agent-browser, returns the documented could-not-run outcome, asserts a headless user agent, and never maps a browser window.
- [ ] #3 Frontend freshness is checked once per lane so unchanged sources build at most once, and each browser process and canvas uses verified ownership and bounded cleanup.
- [ ] #4 Fixed-point coverage preserves zero document diff, malformed-geometry recovery, off-screen inspection export, exact PNG and manifest bytes, bridge suppression, clipping, and unchanged visible pane state.
- [ ] #5 Live-session coverage preserves all 42 cycles, equality after every cycle, server-update ordering, user-edit scheduling, held-board behavior, and hold-generation recovery.
- [ ] #6 Typed-text coverage still lets Excalidraw mint IDs, exercises open editors across writes, and proves every character and rename reaches the board and note.
- [ ] #7 Human-edit performance preserves the 10,000-element human-only reproduction, compact acknowledgement, no scene replacement, structural response checks, same-run relative frame diagnostics, and the rule against fixed millisecond product gates.
- [ ] #8 Every test source file is at most 500 lines; browser tests use condition polling and named timing margins, and no test enters a parallel, random, changed-only, or generic recursive lane by accident.
- [ ] #9 Representative fixed-point, typing, report-order, renderer, and human-response regressions fail before the old scripts are deleted, and the complete browser lane passes repeatedly in documented order.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Dependency and serial-lane boundary. Start only after TASK-130.01, completed TASK-086, TASK-130.06, TASK-130.08, and TASK-130.09 are integrated. Import tests/system/support/owned-canvas.ts for canvas ownership and do not copy or extend it with a declaration shim. All authored files are tests/system-owned under tests/system/browser. This task changes no renderer/server behavior and owns the four browser predecessor mappings and deletions. TASK-130.11 later renames and places the final lane among the four final categories and updates final docs; it does not delete these checks.

2. Exact fixed-point mapping from scripts/check-fixed-point.mjs:
- tests/system/browser/fixed-point-document.test.ts owns every agent-creatable element type, negative paths, font readiness, exact ignored-field allowlist, server/browser element and field equality, zero document diff, exact node/arrow geometry, product bridge metadata/styling/z-order, and the proof that no extra field starts being ignored.
- malformed-geometry-recovery.test.ts owns malformed scratch startup, visible actionable board error, unchanged malformed note bytes, no malformed renderer input, corrected scratch reload, atlas-open refusal/recovery, finite zoom, and finite registered viewport.
- pane-telemetry-recovery.test.ts owns suppression of non-finite browser telemetry, no POST after the PANE_DEBOUNCE_MS margin, exact replay of the prior finite rect/viewport after correction, and clearing the invalid publication key.
- arrow-binding-differential.test.ts owns the human rebound at focus 0.9 and gap 15, held human report, browser oracle, unopened server fixture, exact target movement, 1.0 scene-pixel visible tolerance, two-pixel negative control, and complete failure diagnostics.
- finding-export.test.ts owns off-screen inspection export, one valid and one unmarked bridge crossing, exact persisted report order, PNG/manifest/full-screenshot bytes, embedded image pixels, focus clipping, z-order, viewport independence, and unchanged visible board/scene/selection/viewport.
- shell-layout.test.ts owns desktop shell geometry, touch target sizes, active-board identification, five activity lines and timestamp columns, the 420-pixel responsive strip/no-overflow contract, navigator switching, and original-board return.

3. Exact human-performance mapping from scripts/check-human-edit-performance.mjs:
- tests/system/browser/human-edit-acknowledgement.test.ts owns the 10,000-element fixture seeded only through the human change-report route, isolated response boundary, trusted drag/resize/type staying local during one in-flight report, one latest queued report, progress versus idle scheduling, compact document-free acknowledgement, and no full-scene replacement or no-op tail.
- human-edit-performance.test.ts owns strace/fsync evidence, request/response/JSON/body sizes, hold/report/release counts, the human-only measured window, complete browser fixture, same-run median-relative frame-gap diagnostic, and the rule that no fixed millisecond product gate decides the result.
The fixture size remains exactly 10,000 and all structural response and local-visibility assertions remain gates.

4. Exact live-session mapping from scripts/check-live-session.mjs:
- tests/system/browser/live-session-convergence.test.ts owns the seeded labels/arrow/text, exact 42-cycle rotating agent/human sequence, equality after every cycle, divergence diagnostics, exact document comparison rules, and proof that both sides wrote.
- server-update-ordering.test.ts owns resize/retype/delete/move interleavings between updateScene and baseline recording, in-flight rescheduling, sparse-drag overdue progress, no report caused by server update, and exact final convergence.
- hold-generation.test.ts owns delayed A1, A-to-scratch-to-A switching, distinct A2 ownership, late A1 completion not clearing A2 or scheduling an old retry, and persistence of the A2 edit.
- human-hold-persistence.test.ts owns mid-drag broadcasts, visible unreported edits, note-underneath adoption, stopped-saving state, exact reload/overwrite/save-elsewhere order, authoritative mutex retry, one single-flight hold, and locally editable recovery.
- claim-interaction.test.ts owns claimed-board presentation, camera non-revocation, latest doing line, frame-without-takeover, local pointer responsiveness, content revocation, explicit take-back, told-once next write, and disconnected-pane held-by-default behavior.
All timing constants come from src/shared/timing/timing.ts and the 0.0012-pixel text measurement allowance remains exact.

5. Exact typed-text mapping from scripts/check-typed-text.mjs:
- tests/system/browser/typed-text-element.test.ts owns real text-tool input, an Excalidraw-minted long ID, a second write while the editor stays open, withholding the edited element, every typed character, later canonical block ID, pane/server/note agreement, and posted-ID audit.
- typed-label.test.ts owns double-click label creation, Excalidraw-minted label ID, container write while editor stays open, every character, derived rename with binding preserved, pane/server/note agreement, and the no-renamable-posted-ID proof.
No test substitutes a server-minted ID or programmatic input for trusted browser interaction.

6. Narrow same-owner support and fixtures. Add tests/system/browser/support/agent-browser.ts for typed agent-browser argv/stdin/stdout/stderr, unique session ownership, eval JSON decoding, condition polling, and bounded close; support/frontend-build.ts for source/bundle freshness and one build decision; support/page-scene.ts for the existing React-fiber scene read and report instrumentation mechanics only; and tests/system/browser/run-browser-lane.ts as the sole typed package adapter. Add fixtures/fixed-point-scene.ts, human-performance-scene.ts, and live-session-scene.ts for typed authored inputs only. Expected UA, bytes, element fields, order, timings, and transitions stay in owning tests. Every test, support, runner, and authored TS fixture remains at or below 500 physical lines. There is no browser assertion framework or mutable shared session.

7. Serial runner and documented could-not-run contract. run-browser-lane.ts receives the exact .test.ts paths from package.json, rejects a changed/missing/duplicate order, checks agent-browser and the human-performance strace prerequisite before any test, checks frontend freshness once and builds at most once, then spawns one bun test --isolate --max-concurrency=1 process per listed file in argument order with the verified bundle decision in typed environment state. It never uses --parallel, --concurrent, --randomize, --changed, recursive discovery, or a headed browser. Missing prerequisite or frontend build failure writes the existing actionable stderr and exits 2 without reporting a pass. Product assertion failure preserves the Bun test exit and captured diagnostics. Each test independently asserts a headless navigator.userAgent and disposes browser session, canvas, ports, sockets, state, and vault in finally.

8. Red/parity evidence before deletion. Keep all four scripts while native tests are authored. In disposable checkouts, prove old/new failures for one fixed-point field drift, malformed geometry reaching Excalidraw, a two-pixel endpoint error, changed PNG or manifest byte, full-scene replacement on compact acknowledgement, a fixed performance threshold replacing the relative diagnostic, divergence during one of 42 cycles, dropped ordered human edit, stale A1 clearing A2, camera revoking a claim, text-editor withholding removal, and derived label rename removal. Compare exact screenshots/manifests/stdout/stderr/exits, event/report order, IDs, note bytes, and cleanup. Run the complete native lane repeatedly in the documented order before deleting predecessors.

9. Serialized package and deletion cutover. After parity, the reconciliation owner replaces the four old browser chain entries with one preserved transitional package.json test:browser key whose value is:
bun tests/system/browser/run-browser-lane.ts tests/system/browser/human-edit-acknowledgement.test.ts tests/system/browser/human-edit-performance.test.ts tests/system/browser/fixed-point-document.test.ts tests/system/browser/malformed-geometry-recovery.test.ts tests/system/browser/pane-telemetry-recovery.test.ts tests/system/browser/arrow-binding-differential.test.ts tests/system/browser/finding-export.test.ts tests/system/browser/shell-layout.test.ts tests/system/browser/typed-text-element.test.ts tests/system/browser/typed-label.test.ts tests/system/browser/live-session-convergence.test.ts tests/system/browser/server-update-ordering.test.ts tests/system/browser/hold-generation.test.ts tests/system/browser/human-hold-persistence.test.ts tests/system/browser/claim-interaction.test.ts
Remove the redundant test:human-performance, test:typing, and test:live-session keys and their separate test-chain entries in this same cutover so push reachability is exactly once and only through the serial adapter. Delete scripts/check-fixed-point.mjs, scripts/check-human-edit-performance.mjs, scripts/check-live-session.mjs, and scripts/check-typed-text.mjs. TASK-130.02 inventory must see every literal native path in the adapter command exactly once. TASK-130.11 later renames this preserved transitional key to the final serial-browser category; it does not revisit deletion.

10. Exact direct focused validation, always sequential:
bun test --isolate --max-concurrency=1 tests/system/browser/human-edit-acknowledgement.test.ts tests/system/browser/human-edit-performance.test.ts
bun test --isolate --max-concurrency=1 tests/system/browser/fixed-point-document.test.ts tests/system/browser/malformed-geometry-recovery.test.ts tests/system/browser/pane-telemetry-recovery.test.ts tests/system/browser/arrow-binding-differential.test.ts tests/system/browser/finding-export.test.ts tests/system/browser/shell-layout.test.ts
bun test --isolate --max-concurrency=1 tests/system/browser/typed-text-element.test.ts tests/system/browser/typed-label.test.ts
bun test --isolate --max-concurrency=1 tests/system/browser/live-session-convergence.test.ts tests/system/browser/server-update-ordering.test.ts tests/system/browser/hold-generation.test.ts tests/system/browser/human-hold-persistence.test.ts tests/system/browser/claim-interaction.test.ts
Then run bun run test:browser repeatedly in the same order. Only after it exits run bun run type-check, bun run lint, bun run fmt:check, bun run check, and git diff --check sequentially. Never overlap browser validation with any other browser or hot-reload process. Eventual category is serial-browser; TASK-130.11 owns that final package name.

11. Overlap and merge boundary. tests/system/browser exact paths are disjoint from all predecessor native files. tests/system/support/owned-canvas.ts is read-only and owned by TASK-130.06. package.json is shared and reconciled only after .06/.08/.09 are integrated and validated. No other task edits run-browser-lane.ts or the browser fixture/support files. TASK-130.11 alone later edits package.json and docs/agents/test-suite.md for the final lane inventory.
<!-- SECTION:PLAN:END -->
