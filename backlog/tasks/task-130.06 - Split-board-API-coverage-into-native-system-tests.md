---
id: TASK-130.06
title: Split board API coverage into native system tests
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-28 01:04'
updated_date: '2026-08-28 10:42'
labels: []
dependencies:
  - TASK-130.01
  - TASK-086
references:
  - scripts/check-boards.mjs
  - TASK-086
  - docs/agents/test-suite.md
modified_files:
  - package.json
  - scripts/check-boards.mjs
  - scripts/lib/canvas-test-process.mjs
  - src/shared/timing/timing.ts
  - tests/system/support/owned-canvas.ts
  - tests/system/support/owned-canvas.test.ts
  - tests/system/support/owned-canvas-process-group.test.ts
  - tests/system/boards/support/http.ts
  - tests/system/boards/support/pane-websocket.ts
  - tests/system/boards/board-lifecycle.test.ts
  - tests/system/boards/element-writes.test.ts
  - tests/system/boards/image-persistence.test.ts
  - tests/system/boards/pane-addressing.test.ts
  - tests/system/boards/branching.test.ts
  - tests/system/boards/conversion.test.ts
  - tests/system/boards/malformed-input.test.ts
  - tests/system/boards/scratch-board.test.ts
  - tests/system/boards/held-board-recovery.test.ts
  - tests/system/boards/public-http-refusals.test.ts
  - tests/system/boards/pane-addressing-findings.test.ts
  - tests/system/boards/branching-pane-effects.test.ts
  - tests/system/boards/held-board-note-watch.test.ts
  - tests/system/boards/image-persistence-hydration.test.ts
parent_task_id: TASK-130
priority: high
type: task
ordinal: 141000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
check-boards is 3,894 physical lines at the reviewed base. It combines HTTP, pane, note, conversion, malformed-input, recovery, branching, image, and scratch-board coverage. Convert it after TASK-086 lands so the native tests adopt the verified owned-canvas lifecycle instead of copying startup and teardown again.

Split by endpoint and state transition. Keep one owned canvas per group only where shared setup reduces runtime without creating order dependence.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 check-boards is replaced by typed native system tests grouped by board lifecycle, element writes, pane state, conversion, malformed input, scratch-board behavior, and public HTTP refusals.
- [ ] #2 Every canvas started by the tests uses the TASK-086 lifecycle, verifies health.pid before assertions, retains stderr, reports early death, and leaves no child, listener, or vault on success or failure.
- [ ] #3 Tests preserve exact response statuses and bodies, note bytes, version behavior, frontend-sync tagging, conversion semantics, and malformed-telemetry diagnostics asserted by the legacy script.
- [ ] #4 No test depends on another test having run first; any intentionally shared canvas state is owned by one describe scope with explicit setup and teardown.
- [ ] #5 Every test source file is at most 500 lines and endpoint fixtures expose typed inputs rather than loose objects or computed module imports.
- [ ] #6 Representative route, conversion, scratch-board, and process-death mutations fail the native coverage before check-boards is deleted.
- [ ] #7 The native board system lane passes repeatedly without leaked processes, occupied ports, or changed authored vault files.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Lifecycle ownership. Rebase after TASK-130.01 and preserve TASK-086 behavior. TASK-130.06 is the single owner that converts scripts/lib/canvas-test-process.mjs into narrow typed tests/system-owned support at tests/system/support/owned-canvas.ts. Add tests/system/support/owned-canvas.test.ts for the lifecycle contracts that TASK-086 proved. No other TASK-130 task may copy this helper, add a declaration-only shim, or defer its typing to TASK-130.11.

2. Typed contract. owned-canvas.ts accepts explicit serverPath, port, vault, and environment inputs and returns one typed handle with base, vault, pid, stderr, assertRunning, restart, and idempotent dispose. It preserves exact health.pid ownership, early-death and stderr reporting, serialized restart/dispose, bounded SIGTERM then owned-child SIGKILL, signal cleanup, response-body death detection, listener exit waiting, and vault removal. All duration imports remain in src/shared/timing/timing.ts. The native lifecycle tests prove success, assertion or fetch failure, interruption, early death after headers, foreign PID refusal, and restart/dispose races without leaked processes, ports, or vaults.

3. Board conversion and cutover. Every native board system test in TASK-130.06 imports this tests/system-owned support. After old/new parity, the reconciliation owner serially maps the existing package.json test:boards key to the complete native board test file list, deletes scripts/check-boards.mjs and scripts/lib/canvas-test-process.mjs, and runs the real TASK-130.02 inventory. TASK-130.11 only consolidates final lane names and removes other remaining non-check MJS. It does not migrate or delete this lifecycle helper.

4. Consumer boundary. TASK-130.04 and TASK-130.07 depend on TASK-130.06. Their route and repository-session tests import tests/system/support/owned-canvas.ts directly as same tests/system-owner support. They do not own fallback process code. TASK-130.06 must land its typed helper, lifecycle tests, package mapping, and predecessor deletion before either dependent task integrates.

5. Validation and serialization. Author disjoint native board files as allowed, but serialize package.json, lifecycle migration, check-boards deletion, and integration through the reconciliation owner. Run the owned-canvas focused tests, every TASK-130.06 board test, bun run type-check, bun run lint, bun run fmt:check, bun run check, and git diff --check sequentially. Acceptance requires no reference to scripts/lib/canvas-test-process.mjs and no live child, listener, or vault after success or forced failure.

6. Inventory ordering. Native board files may be authored earlier on disjoint paths, but no TASK-130.06 native test lands until TASK-130.02 has made the real-checkout inventory live. Integrate the complete native board set, the existing test:boards package mapping, check-boards and old-helper deletion, and lifecycle ownership transfer as one serialized unit. Run full sequential validation before the next task integrates.

7. Exact board mapping under 500 physical lines. Source inspection confirms scripts/check-boards.mjs is 3,894 physical lines at the reviewed base, correcting the former 3,549-line count. Create these tests/system-owned files under tests/system/boards, with one exclusive observable contract group per file:
- tests/system/boards/board-lifecycle.test.ts owns create, open, reload, list, normalized identity, registry-without-content, and snapshot behavior.
- tests/system/boards/element-writes.test.ts owns replacement writes, element IDs, exact note results, frontend-sync tagging, and board version behavior.
- tests/system/boards/image-persistence.test.ts owns per-board images, image behavior across branches, embedded-file hydration, and one-reader parity.
- tests/system/boards/pane-addressing.test.ts owns pane registration, selection, open and close, viewport, and ordinary board switching.
- tests/system/boards/branching.test.ts owns save-as, compare and promote, variant stamping, and pane movement caused by branching or promotion. Ordinary pane switching remains only in pane-addressing.test.ts.
- tests/system/boards/conversion.test.ts owns Mermaid conversion and all write-boundary converter behavior.
- tests/system/boards/malformed-input.test.ts owns finite-number validation, malformed note and geometry input, settlement before refusal, exact diagnostics, and exact board or note non-mutation.
- tests/system/boards/scratch-board.test.ts owns scratch home, graceful restart persistence, and killed-process persistence.
- tests/system/boards/held-board-recovery.test.ts owns foreign note edits, stopped-saving state, reload, overwrite, save-elsewhere recovery, and pane notification.
- tests/system/boards/public-http-refusals.test.ts owns board/pane addressing and authority refusals not assigned to another file: absent or unopened board, unqualified element/save/clear/files requests, unknown or unnamed pane, pane-capacity refusal, and board-name collision. It owns the exact status, body, and unchanged-state assertions for those cases only. Missing-doing coverage remains exclusively in TASK-130.08; malformed, conversion, branching, scratch, and held-board refusals remain with their named files.
No contract case is duplicated between these files. When a scenario crosses mechanics, the file that owns the observable outcome owns the full assertion.

Keep tests/system/support/owned-canvas.test.ts beside tests/system/support/owned-canvas.ts. Under tests/system/boards/support, permit only:
- tests/system/boards/support/http.ts for typed request execution, response-body capture, child-liveness checks, and failure diagnostics. It contains no expected status, body, byte, or ordering assertions.
- tests/system/boards/support/pane-websocket.ts for typed WebSocket connection, pane registration, event capture, open and close mechanics, and bounded event waits. It contains no expected event order or state-transition assertions.
Do not add a board scenario helper, assertion framework, shared expected-value table, or lifecycle helper under tests/system/boards/support. No separate authored TypeScript fixture file is planned. Typed request and expected-value fixtures stay in the owning test.

After parity, map package.json test:boards exactly to:
bun test tests/system/support/owned-canvas.test.ts tests/system/boards/board-lifecycle.test.ts tests/system/boards/element-writes.test.ts tests/system/boards/image-persistence.test.ts tests/system/boards/pane-addressing.test.ts tests/system/boards/branching.test.ts tests/system/boards/conversion.test.ts tests/system/boards/malformed-input.test.ts tests/system/boards/scratch-board.test.ts tests/system/boards/held-board-recovery.test.ts tests/system/boards/public-http-refusals.test.ts

Run that identical command as focused validation before bun run type-check, bun run lint, bun run fmt:check, bun run check, and git diff --check. Every listed test, tests/system/support/owned-canvas.ts, owned-canvas.test.ts, both tests/system/boards/support files, and any later approved authored TypeScript fixture must stay at or below 500 physical lines. The repository max-lines rule must enforce the limit. A fixture extraction or contract move that changes this exclusive map requires plan rereview before dispatch or implementation.

8. Review remediation. Preserve the fixed base and current owner map. Add the three pane mechanics durations to src/shared/timing/timing.ts with explicit relationships, without changing unrelated production comments. Restore the reviewed legacy oracle gaps in the existing pane-addressing, element-writes, image-persistence, malformed-input, public-http-refusals, and owned-canvas owner files only. Use filtered red/green runs for timeout cleanup and order dependence, then audit all 3,894 legacy lines section by section against the ten owners. Stop for rereview if any TypeScript owner would exceed 500 lines.

9. Rereview validation. Run the exact eleven-file lane, both filtered independence cases, each owner alone, type-check, lint, fmt, live inventory, diff check, full headless serial check, line counts, and process/listener/vault/temp audits. Record the full parity map and evidence through the CLI, keep acceptance criteria unchecked, amend the coherent unpushed range, and send READY_FOR_REREVIEW against base 7e6be42.

10. Focused rereview gate. Preserve fixed base 7e6be4293114d66dc74717d7826952ca1e079374 and the approved ten-owner map. Make no implementation change until this appended plan is approved. No production behavior or production comment change, no new owner, no generic resource framework, no helper beyond the existing owned lifecycle and pane mechanics, and no package or deletion change.

11. Centralized collision-safe port allocation in tests/system/support/owned-canvas.ts. Make StartOwnedCanvasOptions.port optional. Ordinary board owners omit it and never compute, increment, probe, retry, or expose a raw/random port. An explicit port remains only for focused foreign-PID and collision contracts in owned-canvas.test.ts. Automatic allocation uses the OS and owns the complete retry policy:
- For each attempt, bind a parent net.Server to 127.0.0.1:0 with exclusive ownership, read the assigned candidate from server.address(), close the probe, await its close, and spawn the canvas immediately with that PORT.
- The released probe is not a reservation. Another process may take the candidate before the child binds. That race is harmless because the attempt is accepted only when /health returns the exact PID of that attempt's ChildProcess generation.
- A child EADDRINUSE exit or a /health responder whose PID is not the spawned child is a failed candidate. Stop and reap that exact ChildProcess generation, retain its candidate, child PID/exit, foreign health PID when known, stderr tail, and cleanup result, then ask the OS for another candidate.
- Cap one automatic start or restart operation at eight attempts. Do not sleep between allocation attempts and do not add owner-level retry. Exhaustion reports the accumulated record for all eight attempts with an actionable summary.
- Explicit-port mode performs one exact attempt and never reallocates or falls back.
- An automatic restart first tries the retired generation's old port once. If a foreign process took it, reap the failed replacement, allocate a fresh OS candidate, update the OwnedCanvas base getter, and continue inside the same eight-attempt restart operation.

OS port zero is not passed to the production server. Source inspection shows application.ts treats configured PORT as canonical for its loopback guard, URLs, pidfile, removal, and logs and never reports server.address().port. The support probe uses zero only to ask the OS for a candidate; the spawned canvas always receives the discovered nonzero port.

Cross-process safety argument: concurrent automatic starts each ask the kernel for a currently free candidate. Probe close creates a race, but no correctness claim depends on the probe after close. Child bind plus matching /health.pid is the acceptance gate. A losing generation is reaped before retry, so two callers cannot both accept the same live base. The bounded retry and diagnostics live only in owned-canvas.ts.

12. Lifecycle generation and process-group invariant. Replace mutable child/PID state with one immutable generation record containing generation number, ChildProcess handle, PID evidence, exit promise/result, base, port, and stderr segment. currentGeneration is the only canvas signal target. stopCurrent captures that generation, signals through its retained ChildProcess handle, awaits its exit, and clears currentGeneration only if it still names the same record. Once restart observes original exit, the old generation is retired and no cleanup path signals its PID.

Spawn the lifecycle harness as leader of a dedicated process group. On timeout, signal the retained harness ChildProcess handle first so its installed handler disposes currentGeneration through the retained canvas ChildProcess handle.

On Linux, implement the harness with child_process.spawn(..., { detached: true }). Capture the PGID only from the retained harness ChildProcess at spawn, never parse it from child output. The POSIX negative-PGID signal is authorized only by that retained process-group ownership. If the harness does not exit within the bound, signal the owned process group established at harness spawn, await harness/group shutdown and listener disappearance, then remove only the validated recorded lifecycle vault. Parsed numeric PID and /health records are assertion evidence only and never grant kill authority. There is no direct numeric-PID fallback and no loop over original/replacement PIDs.

The timeout proof records the original only as retired evidence and the replacement as current evidence. It must show that cleanup signalled only the harness handle or the owned group, never targeted the retired original, left a deliberately stolen foreign listener alive, removed the current owned listener and vault, and reaped the harness and replacement.

13. OwnedCanvas postconditions and focused red/green proof in tests/system/support/owned-canvas.test.ts:
- restart resolves only after the replacement generation answers /health with its exact ChildProcess PID. After resolution, canvas.pid and canvas.base name currentGeneration only.
- An automatic base may change after restart. Callers must reread canvas.base after awaiting restart and reconnect any pane sockets. whileStopped observes the retired base and no live current generation.
- Explicit-port restart tries only that port and never reallocates.
- Red: ordinary start without port does not type-check against the current API. Green: automatic start returns a base whose health PID is the owned child.
- Red: start several lifecycle subprocesses concurrently with no requested ports. Green: their lifetimes overlap, every accepted live base is distinct, every health PID matches its ChildProcess generation, and success plus forced failure leave no owned child, listener, or vault.
- Red: during automatic restart, bind a foreign listener to the retired port from whileStopped. Current support fails. Green: support tries the old port once, detects the foreign health response, never kills the foreign listener, reaps the failed replacement, obtains a new OS candidate, updates base, and resolves only after the new generation passes health.
- Red: the current timeout path targets recorded original and replacement PIDs. Green: instrumentation proves only the harness handle or its owned process group was signalled, the retired original was never targeted, a stolen foreign listener survives, and the current listener/vault disappear.
- Keep existing explicit foreign-PID refusal, early-death, interruption, forced failure, restart/dispose, idempotence, and stderr proofs. Assert the eight-attempt cap and exact accumulated diagnostic shape at the lifecycle-support boundary. Add no sleeps or test-wide retry.

14. Ordinary owner migration. Remove raw/random port constants from all ten tests/system/boards owner files. Call startOwnedCanvas with serverPath and vault only, use canvas.base for HTTP, and pass the base URL to pane mechanics. Change tests/system/boards/support/pane-websocket.ts from a numeric-port argument to an owned base URL. scratch-board starts its second malformed canvas through another automatic owned allocation, not port + 1. No board owner sees the allocator policy or retry count.

15. Restore omitted oracle contracts without changing ownership:
- pane-addressing.test.ts directly imports and tests panesInOrder, resolvePaneSpec, soloPane, and MAX_PANES. Restore reading-order/place labels, left/right/position/primary/focused/id resolution, exact zero/one/two-pane outcomes, ambiguous and unknown exact messages, unsupported only refusal, open-pane advice at available capacity, no advice at MAX_PANES, and MAX_PANES === 2.
- branching.test.ts directly tests planPromotion variant versus level behavior. Restore branch response and pane-capacity behavior, scratch pane movement, same-board notification behavior, and the branch/promotion pane outcomes already assigned to this owner.
- public-http-refusals.test.ts runs the public CLI against a canvas with no pane and restores exact browser-required exit code 4 and stderr for every legacy CLI case. Do not duplicate the HTTP refusal already present.
- held-board-recovery.test.ts restores the held save-elsewhere pane response, CLI held exit 5 plus its successful follow-up, and the complete noteWrittenElsewhere contract: unchanged cache hit, mtime/size/baseline invalidation, writtenAt and version movement, exact multiline message, no conflict outcomes before refusal, hold suppression, release restoration, missing-note behavior, and baseline clearing. Expected status, body, message, timestamps, order, and bytes stay visible beside each owner test.

16. Assertion-level oracle inventory. Re-read the exact 3,894-line oracle with git show 7e6be4293114d66dc74717d7826952ca1e079374:scripts/check-boards.mjs. Build a review ledger for every legacy check/assertion leaf, not section headings. Give each leaf a stable source line plus ordinal, record its literal expected status/body/message/order/bytes or predicate, and map it to exactly one owner file and one native expect location. Split compound legacy conditions into separate leaves so a mapped heading cannot hide a missing predicate. Audit both directions and record total leaves, mapped leaves, duplicates, and unmapped leaves in TASK notes. Approval requires unmapped=0 and duplicate-owner=0. Keep the ledger as review evidence in TASK notes or a disposable /tmp artifact; do not turn it into a shared expected-value table or committed test framework.

17. Line-budget gate. Current lines are owned-canvas.ts 271, owned-canvas.test.ts 372, pane-addressing 367, branching 322, public-http-refusals 208, held-board-recovery 310, and pane-websocket 113. Planned ceilings after formatting are approximately 370, 485, 455, 445, 255, 490, and 120 respectively. The other owner migrations remove or replace port lines and must not grow materially; image-persistence starts at 472 and may only shrink or stay flat. Run wc -l after every focused slice. If any owner needs more than 500 physical lines with expected values still visible, stop implementation and return PLAN_APPROVAL_REQUIRED for an explicit split. Do not compress data, extract expected tables, move a contract, or add an owner to evade the limit.

18. Exact proposed implementation files after approval:
- tests/system/support/owned-canvas.ts
- tests/system/support/owned-canvas.test.ts
- tests/system/boards/support/pane-websocket.ts
- all ten existing tests/system/boards/*.test.ts files for port-call migration, with new contract assertions only in pane-addressing.test.ts, branching.test.ts, public-http-refusals.test.ts, and held-board-recovery.test.ts
- TASK-130.06 notes through the Backlog CLI
No package.json change, production source change, new test/support file, new dependency, deletion, or owner-map change.

19. Validation after approval. Run focused red/green filters for automatic allocation, concurrent subprocess allocation, stolen-port restart, OwnedCanvas restart postconditions, process-group timeout cleanup, each omitted contract group, CLI browser-required output, and note-watch cache/suppression/restoration. After the focused, isolated-owner, exact-lane, repeated/concurrent, type-check, lint, fmt:check, live-inventory, and diff checks pass, run bun run check once; its browser checks remain headless and serial. Do not run a second standalone browser lane. Run the final process-group, listener, vault, and temporary-resource audits after that command. Confirm concurrent automatic canvases have distinct verified live bases, every native test is reached once, and both predecessors remain absent. Keep TASK-130.06 In Progress and all AC unchecked until independent rereview.

20. Rereview split gate. owned-canvas.test.ts is 495 formatted lines before the requested remediation. Do not hide the new process evidence or exceed 500. After focused approval, add exactly one test file, tests/system/support/owned-canvas-process-group.test.ts, under the existing owned-canvas lifecycle ownership. Move the current subprocess fixture, process-group runner, and normal/failure/interruption/early-death/restart-dispose/concurrency/timeout proofs into it. This is a test owner split only. It imports the sole tests/system/support/owned-canvas.ts implementation and adds no lifecycle helper, board owner, shared scenario framework, dependency, or production change. Update package.json test:boards from eleven to twelve explicit files and let the live inventory enforce one reach per file.

21. Retained-group timeout correction. In the moved process-group test driver, timeout first signals the retained detached harness ChildProcess handle. After TEST_CANVAS_SHUTDOWN_TIMEOUT_MS, decide escalation only from whether that retained harness has exited. If it has not, signal the negative PGID captured from that retained handle at spawn. Never consult parsed owned/replacement records to authorize or suppress a signal. Await the harness exit with another explicit bound. If the final reap misses its bound, reject with harness/PGID/stdout/stderr diagnostics instead of waiting forever. Parsed records remain evidence and may authorize removal only of a validated lifecycle vault.

22. Timeout proofs. Add two visible cases in owned-canvas-process-group.test.ts. The first hangs in restart whileStopped after the original generation exits and before any replacement record. It ignores graceful SIGTERM, so the retained group path must reap the harness, leave the retired listener absent, and remove the recorded vault despite replacement being undefined. The second coordinates through a retired-generation stdout marker so the parent test process binds a foreign listener to the retired automatic port outside the owned group. Restart detects that foreign health, reallocates and verifies a replacement, then hangs. Group cleanup must remove the owned replacement listener and vault while the parent-owned foreign listener remains live. Assertions name the harness handle and group signals; original/replacement PIDs remain evidence only.

23. Failed-generation cleanup. In owned-canvas.ts, make recordFailure return its attempt record plus a cleanup failure instead of swallowing that failure into a string and continuing. startOperation appends the diagnostic, then aborts immediately on cleanup failure regardless of collision retryability. stopGeneration leaves currentGeneration unchanged when the retained ChildProcess has not exited, so no later startAttempt can overwrite it and dispose can retry that same handle. Keep the successful cleanup and eight-attempt paths unchanged. In the reduced owned-canvas.test.ts, run a cleanup-failure proof in an isolated subprocess that mocks only the node:child_process and fetch OS boundaries: first generation starts and retires, the replacement receives foreign health and refuses both signal exits, current code reaches a third spawn, corrected code stops at two, reports cleanup failure, keeps canvas.pid on the failed replacement, then disposes it after the fixture permits its retained handle to exit. No implementation-only assertion replaces the public spawn count, pid, error, and dispose outcomes.

24. Missing board contracts. In pane-addressing.test.ts, preserve the immediate setup observations before later two-pane mutation: the first pane initially holds scratch; POST board open payments with one pane returns status 200 and pane.place the only pane; that pane adopts payments; a newly registered second pane initially mirrors payments before it is switched. In conversion.test.ts, keep the existing two-pane full refusal, then close one pane and assert status 409 plus the exact archboard pane open --board payments@option-a advice and absence of board open advice. Close the last pane and assert POST elements/from-mermaid returns status 503 and code BROWSER_REQUIRED. These stay in their approved owners.

25. Assertion audit and gates. Regenerate all 479 static assertion leaves from fixed base 7e6be4293114d66dc74717d7826952ca1e079374. Each ledger row must point to a test that executes the scenario and to the specific native expect that proves its literal predicate. Remove the three false mappings at legacy lines 1184-1194, 1693-1707 and 1727-1731 before adding corrected locations. Audit both directions and sample the lifecycle 331-357, pane startup/addressing 1179-1278, pane/conversion/headless 1379-1776, note-watch 2522-2653, held recovery 2908-3263, and atomic/image 3264-3894 sections from source. Approval still requires mapped 479, unmapped 0, duplicate-owner 0 with a new hash. Run red/green per finding, each changed owner alone, the exact twelve-file lane repeatedly including mixed concurrency, type-check, lint, fmt:check, live inventory and git diff --check, then bun run check exactly once headlessly and serially. Finish with process/group/listener/vault/temp audits. Estimated formatted ceilings: owned-canvas.ts 420, owned-canvas.test.ts 280, owned-canvas-process-group.test.ts 480, pane-addressing 450, conversion 225. Stop again before implementation if the new lifecycle file would exceed 500.

Two predecessor-only IDs and justifications:
- L1615.C144.A01 checks the test fixture's secondary pane registration rather than conversion output. Native conversion routing proves the named right pane receives the message and primary left pane does not.
- L530.C021.A01 checks the internal BoardRequiredError class. Native public refusal proves status 400, BOARD_REQUIRED, exact actionable message, and open boards.

26. Rebuild the ledger as a disposable review worksheet. Keep the fixed-base 347 checks / 479 leaves. Add a disposition column with already-proved, restored, or predecessor-only. Final acceptance is preserved/restored 477, predecessor-only 2 with the IDs and justifications above, unmapped 0, duplicate-owner 0. Each of the 477 rows names one executing native expect and records its exact expect text. A simple disposable location/text verifier may check that the cited line exists; semantic review remains source-based. Do not add a permanent parity framework or commit the ledger.

27. Add exactly four owner-local test files and move existing tests without changing the ten approved owners:
- tests/system/boards/pane-addressing-findings.test.ts: move FindingMessage/FindingExport, findingElements, the two finding-note fixtures, inspectionFingerprint, and "correlates focused findings without adopting their off-screen board" from pane-addressing.test.ts. It exclusively owns pane-targeted finding export and callback correlation.
- tests/system/boards/branching-pane-effects.test.ts: move "branches off screen without moving either pane", "refreshes an on-screen save-as destination with an exact replacement delta", and "reports branch capacity, moves named scratch, and notifies same-board saves" from branching.test.ts. It exclusively owns branch/save-as pane effects and CLI screen-capacity advice. Keep any CLI runner local to each file; do not add shared support.
- tests/system/boards/held-board-note-watch.test.ts: move "direct note watch tracks cache, conflict, hold, release, and baseline" and "notifies a pane once when its note changes and clears the mark on reload" from held-board-recovery.test.ts. It exclusively owns note-watch cache/conflict and board_note delivery.
- tests/system/boards/image-persistence-hydration.test.ts: move pluginNote, probeReaders, "hydrates Obsidian embedded files and preserves their wikilinks", and "keeps open and per-request readers identical across hydrated image changes" from image-persistence.test.ts. It exclusively owns Obsidian image hydration, reader parity, fingerprint response, refusals, and the sole-reader source audit.
No new helper file, owner, expected-value table, lifecycle implementation, product seam, or dependency.

28. Restore the 75 missing leaves in their existing owner:
- owned-canvas-process-group: L345.C003.A01, assert both "died" and the retained early-death stderr.
- board-lifecycle: L446.C011.A02; L472-L476; L492; L568 A01-A03; L573; L626 A03; L643 A02; L648; L2385; L2393-L2398; L2419-L2435. Cover Unicode key/file resolution, read casing/declaredKey, content-free registry shape, snapshot metadata plus live mutation, case-insensitive route status/save/frontmatter, and existing-note collision/open behavior.
- branching core: L1800 A01; L1805 A01-A02; L1830 A01-A02; L1852; L1958 A01-A02; L1967 A01-A02; L1973. Add branch status/change-feed destination, exact note variant bytes, explicit level override, and current-board promotion plus clean compare.
- branching-pane-effects: L2090 A01-A02/A04-A06; L2158; L2163. Restore the correlated source-pane barrier, no source switch, no moved pane, authoritative pane report, seven-element branch copy, and loose text copy.
- conversion: L1635.C148.A01, assert the left conversion status 200. Mark L1615 predecessor-only.
- element-writes: L1293; L1298; L1304; L2478 A01; L2489; L3287 A01; L3297 A02. Add qualified-board isolation, exact stored/scene lengths, settled-write status, and settled-id GET status.
- held-board-recovery: L2870 A02; L2906; L3086 A01; L3151 A02; L3162 A03.
- held-board-note-watch: L3207 A01-A02; L3216 A01-A02; L3226 A02-A04. Assert initial clear board_note, changed reason/board directly, absence of hold outcomes/write counters, and unlocked state.
- image-persistence: L3507 A01-A03; L3555 A01; L3584 A01. Change addImage to return the response and put the legacy status/body/count expects in the owning test. Capture orphan-filter and cold-resave statuses.
- image-persistence-hydration: L3716 A01 and L3765 A01, assert the embedded-files heading and escaping-note open status.
- malformed-input: L696 A01 and L1119, assert Error instance and seed-write status.
- pane-addressing: L1258; L1262; L1435 A01-A02; L1441. Replace opaque startup.addressedOnlyRight evidence with direct message and negative-message expects, then switch the shell-created pane and assert status/place/sameBoard.
- pane-addressing-findings: L1577 A01, assert unrenderable export status 200.
- public-http-refusals: no new behavior. Map its 42 already-proved leaves to current route/loop expects, move the viewport-middle citations to pane-addressing, and mark L530 predecessor-only.
- scratch-board: L2834 A01, assert reopen status 200.
All other 248 rows receive corrected citations only. Do not add assertions for already-proved leaves.

29. Package mapping. Replace test:boards with exactly:
bun test tests/system/support/owned-canvas.test.ts tests/system/support/owned-canvas-process-group.test.ts tests/system/boards/board-lifecycle.test.ts tests/system/boards/element-writes.test.ts tests/system/boards/image-persistence.test.ts tests/system/boards/image-persistence-hydration.test.ts tests/system/boards/pane-addressing.test.ts tests/system/boards/pane-addressing-findings.test.ts tests/system/boards/branching.test.ts tests/system/boards/branching-pane-effects.test.ts tests/system/boards/conversion.test.ts tests/system/boards/malformed-input.test.ts tests/system/boards/scratch-board.test.ts tests/system/boards/held-board-recovery.test.ts tests/system/boards/held-board-note-watch.test.ts tests/system/boards/public-http-refusals.test.ts
The live inventory must reach each of these sixteen files exactly once.

30. Line budgets. Add no timing constants and do not touch timing.ts at 491 lines. Reuse TEST_PANE_SOCKET_SETTLE_MS and the existing message/note-watch constants. Expected formatted ceilings: owned process-group 475; board-lifecycle 390; element-writes 340; image-persistence 320; image-persistence-hydration 310; pane-addressing 345; pane-addressing-findings 250; branching 365; branching-pane-effects 340; conversion 245; malformed 200; scratch 165; held recovery 370; held note-watch 240; public refusals 245. Hard stop before any authored TS reaches 501. Do not compress evidence or extract a generic helper to fit.

31. Validation. Run each changed owner file alone, then the exact sixteen-file lane at least three times, including the existing mixed lifecycle concurrency case. Run focused order-independence filters for pane, conversion, held, image, and branching. Re-run the fixed-base legacy oracle in a detached disposable base worktree as review evidence; keep both deleted predecessor paths absent from the current range. Rebuild and source-audit the 479-row ledger both directions, with special review of lifecycle 331-357, board identity/registry/snapshot 420-657, pane 1178-1776, branching 1785-2265, note-watch/held 2522-3251, atomic 3264-3472, and image 3473-3894. Then run type-check, lint, fmt:check, live inventory, git diff --check, and bun run check once. Let that command run browser checks headlessly and serially; do not add a second browser lane. Finish with process-group, listener, vault, and temporary-resource audits. Do not weaken any gate.

32. Scope and range. Keep HEAD 9fa516f as the restoration base. The current lifecycle module, test support, package cutover, and predecessor deletions are safe to retain. Rework only the opaque startup boolean and helper-hidden image assertions noted above. No production defect or lifecycle defect requires rollback. Missing-doing behavior remains exclusively TASK-130.08. TASK-130.11 still owns only final lane naming/layout and remaining non-check MJS. Keep TASK In Progress, @codex, and all seven AC unchecked until the corrected 477+2 ledger and full validation pass.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Authoring checkpoint from base 071b56e. Added the sole typed owned-canvas lifecycle and its native lifecycle proof, the two permitted mechanics helpers, and exactly the ten reviewed tests/system/boards owner files. No production file, package.json, legacy oracle, or legacy lifecycle helper changed.

Parity evidence: the exact reviewed native command passes 51 tests / 301 expectations; the unchanged `bun scripts/check-boards.mjs` oracle passes immediately after the native lane. Every native file also passes alone in reverse owner order, so no file needs a predecessor test. `bun run type-check`, `bun run lint`, `bun run fmt:check`, and `git diff --check` pass. No browser check ran because these migrated contracts use HTTP and WebSocket panes and the legacy oracle records no renderer requirement.

Lifecycle and leak evidence: native proofs cover normal completion, forced fetch failure, SIGINT, death after response headers with retained stderr, restart/dispose serialization, foreign health.pid refusal, idempotent disposal, bounded shutdown, listener exit, and vault removal. Post-run process and recent temp-vault audits found no server from this worktree and no owned vault. Every authored TypeScript file is 322 lines or fewer.

Remaining serialized cutover owned by reconciliation: update package.json test:boards to the exact reviewed eleven-file `bun test` command; delete scripts/check-boards.mjs and scripts/lib/canvas-test-process.mjs; run the live TASK-130.02 inventory; rerun the exact native lane, type-check, lint, fmt:check, full sequential check, line-count/leak audit, and git diff --check. Acceptance criteria intentionally remain unchecked and TASK-130.06 remains In Progress.

Serialized cutover reconciled conflict-free onto fixed base 7e6be42. package.json test:boards now contains the exact reviewed eleven-file native command. Deleted only scripts/check-boards.mjs and scripts/lib/canvas-test-process.mjs. Missing-doing remains exclusively in TASK-130.08; no production code, competing lifecycle helper, declaration shim, shared scenario or assertion framework, expected-value table, or contract ownership changed.

Validation after reconciliation: the exact native command passed 51 tests and 301 expectations. The live TASK-130.02 inventory passed its real-checkout assertion, and a direct inventory report showed each of the eleven native owner tests reached exactly once through test:boards. Every owner file passed alone, from 3 to 6 tests each. bun run type-check, bun run lint, bun run fmt:check, git diff --check, and the full sequential bun run check all passed. The four browser-backed checks in the full chain ran headlessly and serially.

Lifecycle and leak audit: lifecycle proofs cover normal completion, forced failure, interruption, early death, restart/dispose races, foreign PID refusal, retained stderr, bounded shutdown, listener exit, idempotent disposal, and vault removal. After focused, isolated-owner, and full-suite runs, no process from this checkout, Bun/archboard listener, or native temp-vault prefix remained. Older archboard-boards temp directories predated this run and were not touched. All authored TypeScript files are at most 322 physical lines. Both predecessor paths are absent. Acceptance criteria remain unchecked pending review.

Rereview remediation against fixed base 7e6be4293114d66dc74717d7826952ca1e079374:

Restored contracts in existing exclusive owners only. pane-addressing now covers successful /api/export/findings plus /api/export/findings/result, pane targeting, immutable off-screen scenes, exact focus boxes, callback correlation, duplicate and out-of-range refusals, ordered findings/results/fingerprints, and unrenderable source behavior. image-persistence retains successful /api/export/image/result and restores bare-name image lookup, ambiguous-name refusal, open/per-request raw and hash agreement, external-image fingerprint changes for renderable and unrenderable scenes, identical absent/non-note failures, and scene image filtering. element-writes restores hard-link/open-reader preservation, hidden temp naming, fsync-before-rename ordering, inode/no-temp evidence, and a source audit proving every note writer uses writeFileAtomic. held-board-recovery restores independent per-board baselines. malformed-input and public-http-refusals now create their own geometry and collision fixtures. owned-canvas timeout cleanup parses recorded original/replacement PID and vault after timeout, kills only exact recorded process groups/PIDs, removes only the recorded vault, and rejects; its focused leak proof passes.

Timing: pane WebSocket mechanics now import TEST_PANE_SOCKET_SETTLE_MS=80, TEST_PANE_MESSAGE_POLL_MS=20, and TEST_PANE_MESSAGE_TIMEOUT_MS=2000 from src/shared/timing/timing.ts, where each pull-against relationship is documented. No unrelated production comment changed. The stale current-tense board-io reference to scripts/check-boards.mjs is already assigned to approved TASK-130.11 active source-reference audit. scripts/check-side-by-side.mjs and scripts/check-staleness.mjs are predecessor scripts owned by TASK-130.08.

Complete 3,894-line oracle audit:
- 1-381 lifecycle -> owned-canvas.test.ts and owned-canvas.ts.
- 382-557 identity/target -> board-lifecycle and public-http-refusals.
- 558-657 registry/snapshot -> board-lifecycle.
- 658-708 final geometry -> malformed-input.
- 709-865 pane resolver/promotion/specs -> pane-addressing, branching, and public-http-refusals.
- 866-1195 startup/fixtures/malformed/first pane -> owned lifecycle, board-lifecycle, and malformed-input.
- 1196-1282 board/pane addressing -> pane-addressing and public-http-refusals.
- 1283-1313 authority -> public-http-refusals.
- 1314-1344 selection -> pane-addressing.
- 1345-1378 independent baselines/pane departure -> held-board-recovery and pane-addressing.
- 1379-1588 pane creation/closure/viewport/image/findings -> pane-addressing, image-persistence, and public-http-refusals.
- 1589-1776 conversion/headless refusals -> conversion and public-http-refusals.
- 1777-1998 branch/diff/promotion -> branching.
- 1999-2359 branch pane/save-elsewhere/CLI hold -> branching and held-board-recovery.
- 2362-2521 casing/id stability -> board-lifecycle and element-writes.
- 2522-2653 note changed before write -> held-board-recovery.
- 2654-2907 scratch/restart/kill/read-through -> scratch-board and held-board-recovery.
- 2908-3263 held outcomes/notification -> held-board-recovery.
- 3264-3472 settled IDs/atomicity -> element-writes.
- 3473-3646 per-board/cold/branch/image filtering -> image-persistence.
- 3647-3894 plugin hydration/reader/fingerprint/refusal/source audit -> image-persistence.
No assertion group remains unmapped and no generic helper, owner, expected-value table, declaration shim, production behavior, or contract assignment was added.

TDD evidence: the filtered malformed human-change case first failed because it inherited geometry-write state, then passed 1/1 after local setup. The unrenderable image probe first failed because inspection was gated by strict rendering, then passed after independent inspection. The public collision case passes alone 1/1; an additional unnamed-pane dependency found by the audit was isolated and passes alone. Timeout cleanup passes its focused original/replacement PID, listener, and vault proof.

Validation: exact eleven-file lane passes 59 tests / 366 expectations. Every owner passes alone: owned 7, lifecycle 5, element 6, image 7, pane 6, branching 5, conversion 3, malformed 5, scratch 4, held 6, public 5. Filtered independence cases pass alone. type-check, lint, fmt:check, diff check, and live inventory pass; inventory proves every native test is reached exactly once. The first full check encountered one transient occupied scratch port and left no process/listener; the immediate unchanged rerun passed the complete sequential bun run check, including all headless serial browser checks. Final audits found no checkout canvas process, Bun/archboard listener, or owned native temp prefix. Both deleted predecessor paths are absent. All authored TypeScript files are under 500 physical lines; maximum is image-persistence.test.ts at 472. TASK-130.06 remains In Progress with all acceptance criteria unchecked.

Focused rereview plan corrected at parent request. No implementation file changed. Fixed base remains 7e6be4293114d66dc74717d7826952ca1e079374 and the approved owner map, steps 14-19, assertion-leaf ledger, line gates, exact file scope, and protected scope remain intact.

Allocator correction: removed the file reservation, token, inode, directory, descriptor, and related audit design. Every automatic attempt asks the OS for a candidate with a temporary 127.0.0.1:0 net.Server, closes it, spawns immediately, and accepts only a matching child /health.pid. The close-to-spawn race is allowed and harmless because a losing generation is reaped before one of at most eight support-owned retries. Explicit ports remain one attempt. Automatic restart tries the retired base once before reallocating; explicit restart never reallocates.

Timeout correction: removed all direct recorded-PID signal fallback. The lifecycle harness leads a dedicated owned process group. Timeout cleanup signals the retained harness ChildProcess handle first, then the owned group only if bounded graceful cleanup fails. Numeric PID and health records are evidence, not kill authority. The retired original is never a target.

Postcondition correction: restart returns only after verified replacement health. canvas.pid and canvas.base then name currentGeneration. Automatic callers reread base and reconnect panes after restart because the base may move; whileStopped sees the retired base; explicit restart stays on its requested port.

Cross-process validation now proves distinct verified concurrent bases and no child, listener, or vault remains. No browser lane is requested for this focused remediation.

PARENT_ACTION=focused plan rereview. Implementation remains stopped.

Final approved-plan implementation against fixed base 7e6be4293114d66dc74717d7826952ca1e079374 supersedes the earlier timeout wording that authorized recorded numeric PIDs. No implementation path now signals a parsed PID. Retained ChildProcess handles authorize canvas and harness signals; the only process.kill signal uses the negative PGID captured from the detached harness ChildProcess at spawn. Numeric PID and health records are assertion evidence only.

Lifecycle and allocation: ordinary owners no longer choose ports. owned-canvas asks the OS with a parent 127.0.0.1:0 net.Server, closes the unreserved probe, spawns immediately, and accepts only exact generation health.pid. Foreign health or EADDRINUSE reaps that generation before retry; automatic operations cap at eight diagnostic attempts. Automatic restart tries the retired port and may update base after a stolen-port refusal. Explicit restart performs one attempt, retains its base, rejects the foreign health response, and leaves that listener alive. restart resolves only after replacement health verification; whileStopped sees the retired base and pid null. Four concurrent detached lifecycle subprocesses produced distinct verified bases and left no child, listener, or vault. Timeout proof signals the harness handle, then its owned group after the bound, never targets the retired original, and removes the current listener and recorded vault.

Restored omitted contracts in the approved existing owners only. pane-addressing directly covers panesInOrder positions and place labels, left/right/numeric/primary/focused/pane-id resolution, unsupported only, exact full-capacity unknown and two-pane ambiguity messages, open-pane advice, zero/one/two solo behavior, and MAX_PANES 2. branching directly covers planPromotion board variant versus explicit level, full and available pane-capacity CLI responses, scratch pane movement, and same-board elements_changed notification. public-http-refusals covers exact CLI exit 4 plus browser stderr for pane open, pane close, viewport, and screenshot with no pane. held-board-recovery covers held save-elsewhere moved/kept response, CLI exit 5 and the accepted follow-up, plus noteWrittenElsewhere missing-note, own-write, unchanged size/mtime cache, foreign change, timestamps, unchanged version movement, exact multiline message, conflict equality, hold suppression, release restoration, and baseline clearing. Missing-doing remains TASK-130.08. No production behavior/comment, dependency, owner, helper, framework, expected table, or contract assignment changed.

TDD and isolation evidence: the no-port API first failed type-check before StartOwnedCanvasOptions.port became optional. The prior timeout path authorized parsed numeric PIDs; the focused replacement proof now passes through retained handle/group ownership. The stolen automatic restart, eight-collision exhaustion, four-process concurrency, explicit restart refusal, timeout cleanup, direct pane vocabulary, direct promotion, branch capacity/scratch/same-board, browser CLI refusal, held CLI, and direct note-watch filters pass. The malformed human-change and public collision filters each pass alone. Every owner passed alone after reconciliation; the three owners touched by final precision changes were rerun alone.

Assertion-leaf ledger rebuilt from git show of the fixed-base 3,894-line oracle. Disposable review evidence is /tmp/TASK-130.06-assertion-leaf-ledger.tsv, payload SHA-256 3c66f8bfdc1e91fd790d7f7ae4278c219de4b97b04f678a7dd8d5529e4e5158e. It records stable legacy line/check/leaf ordinals, literal predicates, one owner, and one native test location for 347 check calls split into 479 assertion leaves. Totals: mapped 479, unmapped 0, duplicate-owner 0. Owner leaves: board-lifecycle 46, branching 69, conversion 19, element-writes 37, held-board-recovery 89, image-persistence 58, malformed-input 18, owned-canvas 8, pane-addressing 70, public-http-refusals 44, scratch-board 21.

Final validation: every exact eleven-file run passed 68 tests; the final run had 454 expectations, and two preceding repeated runs passed. Live inventory passed and proves every native test is reached exactly once. type-check, lint, fmt:check, and git diff --check passed. bun run check was run once after those gates and passed completely, including browser checks headlessly and serially; no second standalone browser lane ran. Both predecessor paths remain absent.

Final line counts: owned-canvas.ts 397; owned-canvas.test.ts 495; board-lifecycle 215; branching 426; conversion 196; element-writes 271; held-board-recovery 451; image-persistence 470; malformed-input 192; pane-addressing 426; public-http-refusals 239; scratch-board 157; HTTP support 51; pane WebSocket support 116. All are below 500.

Final resource audit found no process or process group from this checkout, no Bun/archboard listener, no native lifecycle or owner vault prefix, and no repository atomic temp. One empty check-local-bind directory created by the full check was removed after verifying it was empty. Two old archboard-scratch directories dated August 25 and 26 predate this run and were not touched. The only loopback listener reported belongs to Cursor, not this checkout. TASK remains In Progress, @codex, and 7/7 AC unchecked for independent fixed-range rereview.

Complete rereview remediation is stopped at the line gate before any implementation edit. owned-canvas.test.ts is 495 physical lines with only five lines available. The requested no-replacement timeout, foreign-listener survival, mixed concurrent failure, and failed exact-child reap cases require separate visible setup and assertions; compressing them into the current file would make the process authority evidence opaque. The smallest honest change is one additional test file under the same owned-canvas lifecycle ownership, plus the package inventory entry. Current HEAD remains 016213d7195cfa3f4c2f791c8b92b5e6d633a069. Status remains In Progress, assignee @codex, and all seven acceptance criteria remain unchecked. PARENT_ACTION=focused approval of steps 20-25 and the one-file test split.

Complete rereview remediation after approved one-file split, fixed base 7e6be4293114d66dc74717d7826952ca1e079374. tests/system/support/owned-canvas.ts remains the sole lifecycle module. owned-canvas.test.ts now owns automatic allocation, stolen automatic restart, bounded collision diagnostics, explicit-port refusal, and isolated failed-generation retention. New owned-canvas-process-group.test.ts owns detached harness groups, lifecycle subprocess outcomes, mixed concurrent success/failure, timeout escalation after replacement, and timeout before any replacement record. package test:boards has exactly the approved twelfth selector. No production behavior, dependency, inventory implementation, owner assignment, shared scenario helper, expected-value table, second lifecycle helper, lease/token state, or numeric-PID signal authorization was added.

Lifecycle remediation: timeout escalation is decided only from the retained detached harness ChildProcess and PGID, not parsed replacement output; final reaping is bounded. Focused cases prove handle-then-group authority, no retired-PID target, cleanup before a replacement record, owned original/replacement listener and vault removal, and survival of a deliberately stolen foreign listener. Mixed concurrency overlaps two successes with two forced failures and leaves four distinct verified bases clean. owned-canvas aborts immediately when stopGeneration cannot reap the exact failed generation, retains that generation handle and public pid for later dispose, and never overwrites it with another attempt. The isolated Bun child registers mock.module("node:child_process", ...) and the fetch replacement before dynamic import. Red evidence: the old path spawned nine children and lost the failed pid; green evidence is spawnCount 2, surfaced SIGKILL cleanup/refusal diagnostic, retained pid 1002, successful later dispose, and removed vault.

Oracle remediation: pane-addressing restores initial scratch, one-pane status 200 and place "the only pane", pane adoption, second-pane mirroring, addressed status/place/isolation, and off-screen board retention. conversion restores the distinct one-free-pane 409 with exact `archboard pane open --board payments@option-a` advice and no `board open` advice, plus exact 503 BROWSER_REQUIRED Mermaid body after the last pane closes; the off-screen fixture now closes its own panes, so the filtered and full-file cases are order-independent. image-persistence directly proves addressed image export reaches only its pane. element-writes now asserts both atomic save statuses and changed content in addition to inode/open-reader/hard-link/temp/fsync ordering. held recovery directly asserts successful independent saves, held listing state, and the historical three-write overwrite result.

Assertion ledger regenerated from the fixed-base 3,894-line oracle and source-audited in both directions. /tmp/TASK-130.06-assertion-leaf-ledger.tsv contains each literal predicate, its exclusive owner, the exact native expect line, and the native expect text. Totals: check calls 347, leaves 479, mapped 479, unmapped 0, duplicate-owner 0. Payload SHA-256 2a4113f2ac9523b4385a02a01f1b0ad0d54bf9108126fc6af55215d0be3bc1f3; complete file SHA-256 f95f548b356312be1b2bc735278dbb7ad8cc9e613f661162b93d804f131569fe. Owner leaves: board-lifecycle 46, branching 69, conversion 20, element-writes 37, held-board-recovery 89, image-persistence 58, malformed-input 18, owned-canvas-process-group 8, pane-addressing 70, public-http-refusals 43, scratch-board 21. The three false mappings now point specifically to pane-addressing lines 228-232, conversion lines 219-221, and conversion lines 228-234. High-risk lifecycle, pane/addressing, conversion/headless, note-watch, held, atomic, and image ranges were sampled directly from source; additional implicit-only mappings found during that audit received visible native expects.

Validation: focused timeout red/green, failed-reap red/green, each changed owner alone, filtered pane/conversion independence, and mixed concurrency pass. The exact twelve-file lane passed three repeated runs at 72 tests and 491 expectations; its full-check run passed again. type-check, lint, fmt:check, live inventory, and git diff --check pass. Live inventory proves every native test is reached exactly once and both predecessors are absent. bun run check was invoked once after the focused gates and passed the complete serial chain, including headless browser checks; no standalone second browser lane ran.

Final physical lines: owned-canvas.ts 410; owned-canvas.test.ts 220; owned-canvas-process-group.test.ts 465; board-lifecycle 215; branching 426; conversion 236; element-writes 274; held-board-recovery 463; image-persistence 477; malformed-input 192; pane-addressing 461; public-http-refusals 239; scratch-board 157; HTTP support 51; pane WebSocket support 116. Every authored TypeScript file remains below 500.

Final resource audit initially found one stale replacement from the deliberately failing pre-fix timeout red run, uniquely identified by this checkout, PGID 4028414, and recorded vault /tmp/archboard-lifecycle-child-oCQmn0. It was the sole group member; the exact owned group was terminated and its exact vault removed. The repeated green lanes and full check left no checkout canvas/test process, owned process group, Bun/archboard listener, matching lifecycle/owner vault, or repository atomic temp. No known technical risk remains beyond independent fixed-range rereview. TASK remains In Progress, @codex, and all seven acceptance criteria remain unchecked.

Second complete-rereview narrow remediation against fixed base 7e6be4293114d66dc74717d7826952ca1e079374. Centralized the reviewed test durations in src/shared/timing/timing.ts with explicit pull relationships, reusing TEST_PANE_SOCKET_SETTLE_MS for socket-settlement waits. owned-canvas.test.ts now obtains its explicit collision-contract port from a loopback port-zero probe and awaits probe close. pane-addressing restores the one-pane pane-open advice, split isolation, and surviving payments board predicates. element-writes now asserts changed atomic bytes directly, and image-persistence separately asserts positive and negative addressed image delivery. No lifecycle design, production behavior, owner assignment, package lane, deletion, dependency, framework, or protected scope changed.

TDD/focused evidence: the explicit-port filter first failed with missing probeLoopbackPort, then passed after the OS probe helper; pane open/close, atomic rename, and addressed image filters pass. Every changed owner passes alone. The exact twelve-file lane passes 72 tests and 496 expectations. type-check, lint, fmt:check, live inventory, and git diff --check pass; live inventory again proves every native test is reached exactly once. bun run check was invoked once after focused gates and passed, including headless serial browser checks; no second browser lane ran. Final audit found no checkout canvas/test process or owned process group, no Archboard listener, no matching lifecycle/owner vault, and no repository atomic temp. The only loopback listener belongs to Cursor.

Line counts: timing 491; owned-canvas direct 237; process-group 467; public refusals 240; branching 427; held recovery 469; pane addressing 469; element writes 276; image persistence 480. Every authored TypeScript file remains below 500.

Assertion ledger correction: the previous 479/479 artifact was invalid because it mapped setup, nearby, and opposite assertions. The rebuilt disposable /tmp/TASK-130.06-assertion-leaf-ledger.tsv is generated from the fixed-base 3,894-line oracle and retains all 347 check calls / 479 logical leaves with duplicate-owner 0. Under the rereviewer rule requiring a specific executing expect, the strictly validated row-citation totals are mapped 154, unmapped 325. Payload SHA-256 8f7cc718fd1dca50e8aa2cba47ddfa70a9c96ea795023f0109a1a22bf5d7cf3b; full SHA-256 53be3f890a0ee10bb725545ee5d9ff1ce331fc7f0c5261eea28150dfd5fd19d1. Known corrected rows now cite the new one-pane/split predicates, distinct positive and negative image expects, historical writes=3, and the direct atomic status/changed-byte/reader/hard-link/inode/temp/fsync/writer expects. The remaining unmapped evidence is broader than this approved narrow remediation and near-cap pane/image/held owners cannot absorb it safely without an explicit split/owner-capacity plan. TASK remains In Progress, @codex, and all seven AC remain unchecked. PARENT_ACTION=plan rereview for the smallest assertion-restoration/split plan; do not integrate this range as parity-complete.

Parity restoration implementation against restoration base 9fa516f6175d6f8e98bbe410b9f133c9062f1f6a and fixed oracle base 7e6be4293114d66dc74717d7826952ca1e079374.

Exact scope: added the four approved owner-local files pane-addressing-findings.test.ts, branching-pane-effects.test.ts, held-board-note-watch.test.ts, and image-persistence-hydration.test.ts; moved only their recorded fixtures/tests; restored the routed 75 leaves in the existing owners; and changed package test:boards to the exact sixteen-file command. The current lifecycle module/support, timing constants, package cutover, and deletions remain intact. No production behavior, dependency, helper/framework/table, owner beyond the four approved files, or TASK-130.08/TASK-130.11 ownership changed.

TDD and semantic review: the four absent owner files supplied the initial red. The branch-effects viewport barrier remained red until its local pane acknowledged the public protocol. Focused reviewers then found eight strict predicate gaps that nearby assertions could not prove: composite early-death marker/stderr, full created/updated replacement objects, destination message board, authoritative right-pane board, container element membership, immediate one-pane count, and immediate surviving-board state. Each received a visible executing expect and its owner passed afterward. Type-check then caught the replacement Map.get optionality; the exact comparison now uses the verified persisted map entries and passes.

Disposable assertion ledger: /tmp/TASK-130.06-assertion-leaf-ledger-final.tsv. All 347 fixed-base checks expand to 479 unique leaves. Totals are already-proved 402, restored 75, predecessor-only 2, preserved/restored 477, unmapped 0, duplicate-owner 0. L1615.C144.A01 and L530.C021.A01 carry the approved justifications. Every other row records one executing native expect, its current path/line, and exact expect text. Five independent source audits covered all rows in both directions, then a disposable verifier re-resolved every citation after formatting. Payload SHA-256 41c724e985ba91dbc7fd5456f8c030ce3dbe966ac23f97db6352c3b66d9eb993; full SHA-256 83e4fb7ce9993ddbe16696be208021db0bc7a33641e8a8b2533f084c675c79ee. The ledger and verifier remain uncommitted review evidence.

Validation: every changed owner passed alone. Focused pane, conversion, held, image, and branching filters passed alone. The exact sixteen-file lane passed three final repeated runs at 74 tests and 573 expectations, including mixed lifecycle concurrency. The detached disposable fixed-base oracle ran bun scripts/check-boards.mjs and passed all checks; the detached worktree was removed. type-check, lint, fmt:check, live test inventory, and git diff --check pass. Live inventory proves every native test is reached exactly once and both deleted predecessors remain absent. bun run check was invoked exactly once after focused gates and passed its entire chain, including all four browser checks headlessly and serially; no standalone browser lane ran.

Final physical lines: timing 491; owned lifecycle 410; owned direct 237; owned process-group 472; board lifecycle 286; element 302; image 241; hydration 294; pane 304; findings 216; branching 284; branch effects 309; conversion 237; malformed 194; scratch 158; held recovery 326; held note-watch 213; public refusals 240; HTTP support 51; pane WebSocket support 116. Every authored TypeScript file is below 500 and every reviewed owner ceiling holds.

Final resource audit found no checkout process or owned process group, no Bun/Archboard listener, no matching lifecycle/owner vault or temporary directory, and no repository atomic temp. The only loopback listener belongs to Cursor. No technical risk remains beyond complete independent fixed-range rereview. TASK remains In Progress, @codex, and all seven acceptance criteria remain unchecked.

Final narrow semantic remediation at HEAD pending amend, fixed base 7e6be4293114d66dc74717d7826952ca1e079374. Added only expect(Array.isArray(unnamed.body.open)).toBeTrue() beside the unchanged scratch membership assertion in tests/system/boards/public-http-refusals.test.ts, directly proving fixed-base leaf L1289.C093.A01.

The disposable final ledger was regenerated from the fixed-base 347 checks / 479 leaves. L1289.C093.A01 now cites tests/system/boards/public-http-refusals.test.ts:73 and exact executing text expect(Array.isArray(unnamed.body.open)).toBeTrue();. Totals remain already-proved 402, restored 75, predecessor-only 2, preserved/restored 477, unmapped 0, duplicate-owner 0. Payload SHA-256 88ead727b725f7f681b94c11d20ff2b91aa9c9fedf725e40a2115581d10078cc; full SHA-256 95d550d338847c555dc79ac631ad3a441930badcd5a8f4646d2177f957d237ad. The ledger remains disposable and uncommitted.

Focused public-http-refusals passed 5 tests / 53 expectations. The exact sixteen-file test:boards lane passed 74 tests / 574 expectations. type-check, lint, fmt:check, live inventory, and git diff --check passed; live inventory proves every native test is reached exactly once. Per the narrow rereview instruction, bun run check/browser was not rerun; the prior successful single full-check evidence remains the applicable browser/headless/serial proof. Final resource and line audits are recorded in the callback after the coherent amend. TASK remains In Progress, @codex, and all seven acceptance criteria remain unchecked.
<!-- SECTION:NOTES:END -->
