---
id: TASK-143.08.01
title: Remove OOM validation and backend hot reload
status: In Progress
assignee:
  - '@codex'
created_date: '2026-09-02 01:36'
updated_date: '2026-09-02 02:44'
labels: []
dependencies: []
references:
  - docs/adr/0014-no-build-step-bun-runs-the-source.md
  - docs/adr/0021-backend-source-changes-require-a-restart.md
  - src/runtime/engine/hot.ts
  - src/dev-canvas.ts
  - scripts/typescript-analysis.ts
  - docs/agents/test-suite.md
parent_task_id: TASK-143.08
priority: high
type: bug
ordinal: 259000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
This remains the first and exclusive recovery gate. A 2026-09-02 uncapped repository run in the rejected implementation invoked type-aware Oxlint and tsgolint against the root graph; the kernel killed tsgolint after it reached about 32 GiB anonymous RSS with swap exhausted. Remove the backend hot-reload feature and its kept() lifetime model rather than replacing the analyzer. Delete the async compiler, fingerprint, mirror, alias, and source-scanning contract machinery. Fix the concrete promise and deterministic policy failures directly. Generated Codex type authority begins later in TASK-143.08.02 through ordinary product imports, never source scanning. No later recovery, legacy cleanup, or feature implementation starts until this task passes bounded validation and independent review.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Backend production has no bun hot/watch entry, reload command or endpoint, reload token, reload canary, global kept() registry, module-scope analyzer, or reload fixture/test; backend source changes require an explicit restart, while Vite HMR runs as an independent frontend process with no shared backend lifecycle.
- [ ] #2 One Canvas application lifetime owns every retained HTTP or WebSocket server, Codex child, browser socket, pane lease, pending operation, board hold, lock or claim timer, note watch, change-feed timer, and other resource requiring teardown. Startup and shutdown order is explicit and observable; harmless caches may remain module-local only when they own no handle, listener, child, timer, or process-only user work.
- [ ] #3 The normal stop and restart workflow and stale-source remedy check for held boards before signaling, refuse while any hold exists, and name each held board and its recovery actions. Direct tests cover clean startup failure, no-browser and connected-browser shutdown, pending-operation settlement, Codex child reaping, lock, claim, watch, and feed cleanup, hold refusal and recovery, signal and timeout paths, and a second fresh application start.
- [ ] #4 No repository-authored analyzer, policy, test, support module, or script imports typescript/unstable/async, @babel/parser, or @babel/types; no direct dependency is added for module-scope or generated-contract analysis; and no custom TypeScript AST walk or type-aware Oxlint/tsgolint policy enforces these rules. The fingerprint, mirror, alias, digest, and method-inventory corpus is deleted, and TASK-143.08.02 owns generated type authority through ordinary imports. Unrelated transitive frontend tooling remains outside this scope.
- [ ] #5 Every identified promise assertion is awaited, and every affected compiler, child, test server, timer, and process group is awaited or synchronously reaped on success, failure, signal, and timeout. Add automated enforcement only if it is stable and bounded without parsing TypeScript or loading a type graph; otherwise record the required manual review and why another analyzer would be worse.
- [ ] #6 The timing policy includes CODEX_WAIT_TARGET_POLL_MS with its documented relationship, quarantine capacity crosses a module-root entrypoint, and vendor-element detection accepts the two legitimate workbench files without a file allowlist or weakened native-field rule.
- [ ] #7 Before any repository lane, a small red-capable reproduction proves the OOM mechanism is gone. Every potentially type-aware process in the first post-fix repository run, including descendants, runs inside the same fresh transient user unit with MemoryMax=6G and MemorySwapMax=1G. The affected repository lane then passes twice in fresh units, stays below the limit, reports no OOM kill, and leaves no tasks or descendants.
- [ ] #8 The rejected worktree /home/msc/.codex/worktrees/b6e0/archboard remains untouched as incident evidence and none of its changes are integrated. The stopped archboard-task143-r2-reload-owner-4.scope remains dead, and /tmp/archboard-codex-production-WKF70O is removed only after fresh identity verification; every unrelated process, worktree, and path remains untouched.
- [ ] #9 No timeout increase, skip, warning allowance, lint or type relaxation, uncapped broad gate, or broad memory increase obtains a pass. A fixed-range independent review is clean before the task is finalized and before any dependent implementation starts.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Preserve the rejected b6e0 worktree and record the OOM command, process, memory, kernel, and verified legacy-scope cleanup evidence. Do not run another command there.
2. Maintain ADR 0021 and inventory every backend reload, kept(), module-scope policy, generated-contract scanner, test, script, command, route, timing, and current-doc owner. Keep frontend Vite HMR only as a separate frontend process.
3. Before editing production state owners, record an ownership table for every kept() consumer and related process resource. Assign HTTP and WebSocket servers, the Codex child, browser sockets, pane leases, pending operations, board holds, locks, claims, note watches, change-feed timers, and any other handles to one Canvas application lifetime with explicit startup and reverse-order teardown. Classify module-local caches only when they own no teardown or process-only user work.
4. Write a small red-capable reproduction for the specific unbounded analysis path. It must run inside a transient user unit that contains every descendant and enforces MemoryMax=6G and MemorySwapMax=1G. Do not run the repository lane yet.
5. Remove backend hot reload, the kept() registry, reload token/canary/dev entry, module-scope analyzer and fixtures, and their commands, routes, tests, timings, and current guidance. Move retained resource ownership into the Canvas application and verify deterministic construction and teardown.
6. Guard normal stop and restart before signaling. If any board is held, refuse, name each board and its recovery actions, and make stale-source guidance use the same path. Cover startup failure, no-browser and connected-browser shutdown, pending operation settlement, Codex child reaping, timer and watch cleanup, hold recovery, signals, timeouts, and a second fresh start.
7. Delete the async compiler and generated fingerprint, mirror, alias, digest, inventory, and source-scanning machinery. Add no replacement parser, custom AST walk, direct analysis dependency, or type-aware lint policy. Leave generated contract enforcement to TASK-143.08.02 through imports in ordinary type-checking.
8. Await the concrete floating promise assertions and repair the timing, quarantine-boundary, and vendor-field failures through their production contracts. Use a bounded no-parser enforcement only if it remains simpler than manual review.
9. Run focused tests inside capped units. Then run the affected repository lane twice, each in a fresh 6G RAM plus 1G swap unit that contains all descendants; record command, unit identity, exit, MemoryPeak, OOM counters, task state, and descendant cleanup.
10. Obtain an independent fixed-range review, return valid findings to the same fresh worker, and repeat until clean. Finalize TASK-143.08.01 only after the review and capped evidence pass.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Read-only policy audit 01a05feb-6467-7e80-83ed-ee37b5c0d676 completed at fixed base 71a3e6bf. Confirmed: CODEX_WAIT_TARGET_POLL_MS needs a machine-checked relation to CODEX_REQUEST_SETTLEMENT_MS; dynamic-tools must consume capacity through codex-transport/index.ts; the vendor alias detector must narrow by board-ingress context rather than allowlist two legitimate workhorse files; the compiler-worker fingerprint/mirror/alias unit can be deleted while retaining direct ignored-path and adapter/deep-import boundary checks; codex-realtime contract owners also import the forbidden async compiler helper and must be replaced or removed for AC #1. No files changed and no validation ran.

Read-only leak audit 01a05feb-6061-7cf3-a6ae-1fba244af2bc completed at fixed base 71a3e6bf. It found four forbidden whole-project async compiler import sites: scripts/typescript-analysis.ts, support/codex-protocol-aliases.ts, codex-protocol-fingerprint-corpus.test.ts, and src/ui/codex-realtime/tests/contract.test.ts. Three discard close operations; the fourth still violates the no-worker criterion. It also found 16 unawaited Bun rejects assertions across canvas adapters, realtime, dynamic-tools, wait, quarantine, and process-contract owners. The affected Vite and Oxfmt helpers showed no additional confirmed leak. Recommended enforcement is one bounded repository policy that rejects the async compiler import and floating resolves/rejects assertions without loading TypeScript project graphs. No files changed and no broad validation ran.

HOLD, 2026-09-02 user decision: reject @babel/parser, @babel/types, custom TypeScript AST walking, and source scanning as the generated Codex contract authority. Do not integrate, rewrite, reset, clean, or discard the current implementation worktree. The implementation worker has been ordered to stop and preserve it unchanged. Resume only after the user decides whether to remove only the AST-based module-scope policy or remove the hot-reload and kept() lifecycle entirely. Generated Codex contracts must later be enforced by importing generated types into ordinary product type-checking.

OOM incident, 2026-09-02 04:32:18: rejected worker task 01a05feb-6020-71b0-82fc-1b2fcb6918b4 ran bun run test:repository without a memory cap. Its new type-aware Oxlint promise-expectations policy invoked tsgolint PID 3860572 against the root graph. Kernel evidence reports about 32,082,352 KiB anonymous RSS with swap exhausted before the OOM killer terminated it. The worker is stopped. Its detached b6e0 worktree remains at 71a3e6bf with unstaged evidence and no commit. Integrate none of it.

Verified legacy scope cleanup, 2026-09-02: before stopping it, the parent re-resolved archboard-task143-r2-reload-owner-4.scope and confirmed its sole task was PID 2996816 running bun --hot /tmp/archboard-codex-production-WKF70O/hot-production-server.ts. The scope had been active about ten hours and reported 17.5 MiB current memory, 250.1 MiB peak, and 181 MiB swap. The parent stopped that exact transient scope. Follow-up state was ActiveState=inactive, SubState=dead, with no MainPID or tasks. /tmp/archboard-codex-production-WKF70O remains in place and must be removed only by the fresh implementation after another exact identity check.

Plan review task 01a05ffc-6487-7022-aa56-f825422d7c6b returned PLAN_FINDINGS on 16d5e23c..29aa0587. The root accepted all three: make Canvas application resource ownership and teardown explicit, guard restart and stop against held-board loss, remove ADR 0014 current-tense reload guidance, and narrow the Babel prohibition to authored analyzers and direct enforcement dependencies so unrelated transitive frontend tooling stays in scope only for its owner.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-09-02 01:43
---
Audit snapshot, 2026-09-02: the leaked owner was archboard-task143-r2-reload-owner-4.scope with observed PID 2996816 running bun --hot /tmp/archboard-codex-production-WKF70O/hot-production-server.ts. Re-resolve the unit and command before cleanup because the PID can change; remove only that verified unit and /tmp/archboard-codex-production-WKF70O, never a broad /tmp target.
---
<!-- COMMENTS:END -->
