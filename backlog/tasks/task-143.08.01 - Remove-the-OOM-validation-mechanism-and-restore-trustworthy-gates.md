---
id: TASK-143.08.01
title: Remove OOM validation and backend hot reload
status: In Progress
assignee:
  - '@codex'
created_date: '2026-09-02 01:36'
updated_date: '2026-09-03 00:00'
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
- [ ] #4 No repository-authored analyzer, policy, test, support module, or script imports typescript/unstable/async, @babel/parser, or @babel/types; no direct dependency is added for module-scope or generated-contract analysis; and no custom TypeScript AST walk exists. No repository validation invokes Oxlint --type-aware or tsgolint, and the direct oxlint-tsgolint dependency is removed. The fingerprint, mirror, alias, digest, and method-inventory corpus is deleted; TASK-143.08.02 owns generated type authority through ordinary imports. Unrelated transitive frontend tooling remains outside this scope, while existing boundary behavior remains covered by ordinary TypeScript and bounded type-unaware tests.
- [ ] #5 Every identified promise assertion is awaited, and every affected compiler, child, test server, timer, and process group is awaited or synchronously reaped on success, failure, signal, and timeout. Add automated enforcement only if it is stable and bounded without parsing TypeScript or loading a type graph; otherwise record the required manual review and why another analyzer would be worse.
- [ ] #6 The timing policy includes CODEX_WAIT_TARGET_POLL_MS with its documented relationship, quarantine capacity crosses a module-root entrypoint, and vendor-element detection accepts the two legitimate workbench files without a file allowlist or weakened native-field rule.
- [ ] #7 From its first command through its final report, the replacement implementation worker invokes every external command only through one root-provided, preverified capped-command wrapper. Each invocation creates a fresh transient user unit with MemoryMax=6G, MemorySwapMax=1G, OOMPolicy=kill, and whole-descendant containment; the wrapper serializes invocations, waits for cleanup, and fails closed if the unit or any descendant survives. This covers git, Backlog, search and read helpers, build, test, lint, typecheck, package-manager commands, formatters, and probes. apply_patch may edit files, but any checker or formatter it starts is wrapped. A wrapper bypass, OOM, cleanup failure, or residual task aborts the worker.
- [ ] #8 Before any repository lane, a small red-capable reproduction invoked through that wrapper proves the OOM mechanism is gone. The affected repository lane then passes twice in fresh capped units, stays below the limit, reports no OOM kill, and leaves no tasks or descendants.
- [ ] #9 The rejected worktree /home/msc/.codex/worktrees/b6e0/archboard remains untouched as incident evidence and none of its changes are integrated. The stopped archboard-task143-r2-reload-owner-4.scope remains dead, and /tmp/archboard-codex-production-WKF70O is removed only after fresh identity verification; every unrelated process, worktree, and path remains untouched.
- [ ] #10 No timeout increase, skip, warning allowance, lint or type relaxation, uncapped broad gate, broad memory increase, or uncapped worker command obtains a pass. Normal uncapped development is restored only by a later explicit root decision after the full recovery task, two capped repository passes, cleanup evidence, and a clean fixed-range independent review. That review is clean before the task is finalized and before any dependent implementation starts.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Preserve the rejected b6e0 worktree and record the OOM command, process, memory, kernel, and verified legacy-scope cleanup evidence. Do not run another command there.
2. Before dispatch, the root provides and preverifies one capped-command wrapper. The worker may call exec_command only through that absolute wrapper path; no shell or terminal command may bypass it. For every invocation the wrapper serializes access, creates a fresh transient user unit with MemoryMax=6G, MemorySwapMax=1G, OOMPolicy=kill, and whole-descendant containment, waits for completion and cleanup, and fails closed on OOM, a surviving unit, or any descendant. File patches may use apply_patch, but every spawned checker or formatter uses the wrapper.
3. Maintain ADR 0021 and inventory every backend reload, kept(), module-scope policy, generated-contract scanner, test, script, command, route, timing, and current-doc owner. Keep frontend Vite HMR only as a separate frontend process.
4. Before editing production state owners, record an ownership table for every kept() consumer and related process resource. Assign HTTP and WebSocket servers, the Codex child, browser sockets, pane leases, pending operations, board holds, locks, claims, note watches, change-feed timers, and any other handles to one Canvas application lifetime with explicit startup and reverse-order teardown. Classify module-local caches only when they own no teardown or process-only user work.
5. Through the required wrapper, write and run a small red-capable reproduction for the specific unbounded analysis path. Do not run the repository lane yet.
6. Remove backend hot reload, the kept() registry, reload token/canary/dev entry, module-scope analyzer and fixtures, and their commands, routes, tests, timings, and current guidance. Move retained resource ownership into the Canvas application and verify deterministic construction and teardown.
7. Guard normal stop and restart before signaling. If any board is held, refuse, name each board and its recovery actions, and make stale-source guidance use the same path. Cover startup failure, no-browser and connected-browser shutdown, pending operation settlement, Codex child reaping, timer and watch cleanup, hold recovery, signals, timeouts, and a second fresh start.
8. Delete the async compiler and generated fingerprint, mirror, alias, digest, inventory, and source-scanning machinery. Remove every repository Oxlint --type-aware and tsgolint path plus the direct oxlint-tsgolint dependency, retaining observable boundary and type behavior through ordinary TypeScript and bounded type-unaware tests. Add no replacement parser, custom AST walk, direct analysis dependency, or type-aware lint policy. Leave generated contract enforcement to TASK-143.08.02 through imports in ordinary type-checking.
9. Await the concrete floating promise assertions and repair the timing, quarantine-boundary, and vendor-field failures through their production contracts. Use a bounded no-parser enforcement only if it remains simpler than manual review.
10. Run focused tests through the wrapper. Then run the affected repository lane twice, each in a fresh capped unit; record command, unit identity, exit, MemoryPeak, OOM counters, task state, and descendant cleanup. Any OOM, wrapper bypass, surviving task, or cleanup failure aborts the worker.
11. Obtain an independent fixed-range review, return valid findings to the same fresh worker, and repeat until clean. Only after the full task, two capped repository passes, cleanup evidence, and clean review may the root explicitly restore normal uncapped development. Finalize TASK-143.08.01 only after that decision.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Read-only policy audit 01a05feb-6467-7e80-83ed-ee37b5c0d676 completed at fixed base 71a3e6bf. Confirmed: CODEX_WAIT_TARGET_POLL_MS needs a machine-checked relation to CODEX_REQUEST_SETTLEMENT_MS; dynamic-tools must consume capacity through codex-transport/index.ts; the vendor alias detector must narrow by board-ingress context rather than allowlist two legitimate workhorse files; the compiler-worker fingerprint/mirror/alias unit can be deleted while retaining direct ignored-path and adapter/deep-import boundary checks; codex-realtime contract owners also import the forbidden async compiler helper and must be replaced or removed for AC #1. No files changed and no validation ran.

Read-only leak audit 01a05feb-6061-7cf3-a6ae-1fba244af2bc completed at fixed base 71a3e6bf. It found four forbidden whole-project async compiler import sites: scripts/typescript-analysis.ts, support/codex-protocol-aliases.ts, codex-protocol-fingerprint-corpus.test.ts, and src/ui/codex-realtime/tests/contract.test.ts. Three discard close operations; the fourth still violates the no-worker criterion. It also found 16 unawaited Bun rejects assertions across canvas adapters, realtime, dynamic-tools, wait, quarantine, and process-contract owners. The affected Vite and Oxfmt helpers showed no additional confirmed leak. Recommended enforcement is one bounded repository policy that rejects the async compiler import and floating resolves/rejects assertions without loading TypeScript project graphs. No files changed and no broad validation ran.

HOLD, 2026-09-02 user decision: reject @babel/parser, @babel/types, custom TypeScript AST walking, and source scanning as the generated Codex contract authority. Do not integrate, rewrite, reset, clean, or discard the current implementation worktree. The implementation worker has been ordered to stop and preserve it unchanged. Resume only after the user decides whether to remove only the AST-based module-scope policy or remove the hot-reload and kept() lifecycle entirely. Generated Codex contracts must later be enforced by importing generated types into ordinary product type-checking.

OOM incident, 2026-09-02 04:32:18: rejected worker task 01a05feb-6020-71b0-82fc-1b2fcb6918b4 ran bun run test:repository without a memory cap. Its new type-aware Oxlint promise-expectations policy invoked tsgolint PID 3860572 against the root graph. Kernel evidence reports about 32,082,352 KiB anonymous RSS with swap exhausted before the OOM killer terminated it. The worker is stopped. Its detached b6e0 worktree remains at 71a3e6bf with unstaged evidence and no commit. Integrate none of it.

Verified legacy scope cleanup, 2026-09-02: before stopping it, the parent re-resolved archboard-task143-r2-reload-owner-4.scope and confirmed its sole task was PID 2996816 running bun --hot /tmp/archboard-codex-production-WKF70O/hot-production-server.ts. The scope had been active about ten hours and reported 17.5 MiB current memory, 250.1 MiB peak, and 181 MiB swap. The parent stopped that exact transient scope. Follow-up state was ActiveState=inactive, SubState=dead, with no MainPID or tasks. /tmp/archboard-codex-production-WKF70O remains in place and must be removed only by the fresh implementation after another exact identity check.

Plan review task 01a05ffc-6487-7022-aa56-f825422d7c6b returned PLAN_FINDINGS on 16d5e23c..29aa0587. The root accepted all three: make Canvas application resource ownership and teardown explicit, guard restart and stop against held-board loss, remove ADR 0014 current-tense reload guidance, and narrow the Babel prohibition to authored analyzers and direct enforcement dependencies so unrelated transitive frontend tooling stays in scope only for its owner.

Plan rereview task 01a05ffc-6487-7022-aa56-f825422d7c6b found that the first correction still qualified the type-aware lint ban. The root accepted the finding. The task and ADR now require removing every repository --type-aware Oxlint and tsgolint invocation and the direct oxlint-tsgolint dependency, while retaining boundary and type behavior through ordinary TypeScript and bounded type-unaware tests.

New parent safety requirement, 2026-09-02: the replacement worker is command-capped for its entire lifetime, not merely during validation. Every external command must enter through one root-provided and preverified wrapper that serializes fresh 6G RAM plus 1G swap transient user units, contains all descendants, waits for cleanup, and fails closed on OOM or residual tasks. The worker may use apply_patch for file edits, but may not run an unwrapped helper, checker, formatter, git, Backlog, search, build, package, test, or probe command. The earlier rereview range is superseded until this operational requirement is committed and independently approved.

Plan review gate passed. Independent xhigh daybreak reviewer task 01a05ffc-6487-7022-aa56-f825422d7c6b returned REVIEW_OK for the complete fixed range 16d5e23c..a6c8ca6f. It confirmed the worker-wide wrapper contract, delayed restoration of uncapped development, unconditional type-aware lint and tsgolint removal, transitive frontend tooling exception, Canvas application ownership and teardown, held-board restart refusal, lifecycle coverage, and corrected ADR 0014 guidance. No broad or type-aware validation ran during review.

Root-provided wrapper /home/msc/.codex/task-143.08.01/capped-command was preverified before worker dispatch at SHA-256 3c5f4f09f6f916514988471838848a714479536e009d047c111412ff4f4cb858. Direct probes confirmed MemoryMax=6442450944, MemorySwapMax=1073741824, OOMPolicy=kill, KillMode=control-group, MemoryAccounting=yes, TasksAccounting=yes, current directory and environment propagation, exact nonzero exit propagation, descendant reaping, serialized concurrent invocations, fail-closed SIGKILL status 124, syntax, mode 700 ownership, and no residual unit or cgroup.

IPC remediation recovery, 2026-09-03, base/head bfc95fa7 before commit. Root cause: git-process-owner reported one terminal result but retained its message listener and Bun IPC channel after parent release, so the owner could not exit; process-group membership scanning also rejected unrelated Linux kernel records whose process group is zero. The owner now removes the listener, disconnects IPC after release, and exits after exactly one result. Detached leader capture still rejects nonpositive or mismatched groups. The direct owner/release regression passed 1/1 in 14 ms, and src/runtime/engine/tests/git-async.test.ts passed 4/4 in 1.65 s. Focused Oxfmt and type-unaware Oxlint passed for all three changed files. Every named validation unit became not-found, inactive/dead with MainPID 0 and empty ControlGroup; each exact cgroup and runtime gate path was absent, and no archboard-git fixture root remained. Five earlier stale fixture/diagnostic roots were independently attributed, proven to have no live cwd, root, fd, or cgroup owner, removed by exact path, and rechecked absent. The two repository passes are intentionally deferred until this range is rebased onto canonical 4ca545c6b48e8e78e7eb4301d5337aeb930cc4ad.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-09-02 01:43
---
Audit snapshot, 2026-09-02: the leaked owner was archboard-task143-r2-reload-owner-4.scope with observed PID 2996816 running bun --hot /tmp/archboard-codex-production-WKF70O/hot-production-server.ts. Re-resolve the unit and command before cleanup because the PID can change; remove only that verified unit and /tmp/archboard-codex-production-WKF70O, never a broad /tmp target.
---
<!-- COMMENTS:END -->
