---
id: TASK-143.01.04
title: Own the dedicated Codex app-server child
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-30 15:07'
updated_date: '2026-08-31 00:32'
labels: []
dependencies:
  - TASK-143.01.16
references:
  - docs/adr/0019-the-workbench-owns-one-codex-app-server-session.md
  - docs/design/codex-workbench-authored-contracts.md
modified_files:
  - src/runtime/codex-process
parent_task_id: TASK-143.01
priority: high
type: task
ordinal: 174000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Own one dedicated Codex 0.151.0 stdio child, exact environment/config construction, effective storage roots, stderr drainage, restart policy, and process shutdown. The child never attaches to Desktop or a shared daemon. Delegation profile: gpt-5.6-luna, max.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Before spawn, the host creates restrictive dedicated CODEX_HOME and CODEX_SQLITE_HOME directories and atomically writes CODEX_HOME/config.toml with exactly sqlite_home = the quoted canonical absolute SQLite root; permissions, ownership, escaping, symlinks, and pre-existing conflicting config fail closed.
- [ ] #2 The exact argv is the configured absolute codex binary followed by app-server, --stdio, --strict-config; version is proven as 0.151.0 and no daemon, proxy, listen, websocket, analytics-default, code-mode-host, or Desktop MCP argument is accepted.
- [ ] #3 The child environment is built from empty using exactly the retained keys and order frozen in the authored contract, then canonical CODEX_HOME and CODEX_SQLITE_HOME overwrite ambient values; a poisoned-environment fixture asserts the exact output key set, byte-preserved values, absent optional keys, NUL rejection, and no fallthrough.
- [ ] #4 stderr drains continuously into bounded diagnostics; missing/wrong binary, config write/fsync/rename failure, locked/unwritable/colliding roots, strict-config rejection, early exit, crash, backoff, TERM/KILL, and stopped state are deterministic with no orphan.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Reconcile the reviewed private-child contract with current process, filesystem, atomic-write, timing, and exact Codex 0.151.0 executable conventions.
2. Build one deep codex-process module that prepares restrictive dedicated storage, writes the exact strict config atomically, constructs the closed ordered environment and argv, and exposes a typed lifecycle without module-scope state.
3. Exercise every reachable startup, stderr, crash/backoff, TERM/KILL, storage/config refusal, and cleanup state through owned process tests with real subprocess fixtures and no orphaned children.
4. Run focused process tests, complete module and repository lanes, both TypeScript projects, lint, format, diff and clean-status checks; record evidence without finalizing before independent review.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Capacity reservation at integration HEAD 34aa9e4: TASK-143.01.16 completion opened four disjoint leaves, TASK-143.01.04, TASK-143.01.06, TASK-143.02.02, and TASK-143.06.01. Three tracked leaf workers remain active on TASK-143.01.07, TASK-143.01.18, and TASK-144.01, while the completed TASK-143.01.17 owner performs a read-only contract clarification outside tracked implementation. This reservation fills the fourth leaf-worker slot with TASK-143.01.04 because it unlocks both TASK-143.01.05 and the session chain through TASK-143.01.08. The other three ready leaves remain To Do solely because the repository caps concurrent leaf workers at four; all have disjoint ownership and should be reserved as slots free.

Implemented in commit dffd566 from base 863ec41391267793e0c0faeec291ca10f1d6e48b. Added the typed codex-process owner with project-local Codex 0.151.0 verification, exact app-server argv, closed ordered environment, restrictive two-root storage, atomic strict config, bounded stderr, shared-timing backoff, detached process-group TERM/KILL shutdown, and terminal failure cleanup. Validation: bun install --frozen-lockfile passed with no changes; bun test src/runtime/codex-process/tests passed 18 tests and 89 expectations; bun run test:modules passed 1,031 tests and 7,135 expectations across 79 files; bun run test:repository passed 130 tests and 415 expectations across 11 files; bun run type-check passed both TypeScript projects; bun run lint, bun run fmt:check, and git diff --check passed. Real process: project-local node_modules/@openai/codex/bin/codex.js verified and started with [app-server,--stdio,--strict-config], reached running, wrote sqlite_home = the canonical quoted SQLite root, stopped, and left process-group probe groupAlive=false. BASE..HEAD path audit contains exactly the nine files under src/runtime/codex-process and the worktree is clean. Remaining risk: downstream transport/session/composition and full system/browser lanes remain outside this leaf. PARENT_ACTION: independently review dffd566 and integrate it; keep TASK-143.01.04 In Progress until review acceptance.

Review remediation committed in 8d56b7d2ca4259f0708839aa21adb62a6ceeb3e8 from reviewed HEAD 07cd054f4cabd22d014b96432d354e4a94f191d3 and fixed BASE 863ec41391267793e0c0faeec291ca10f1d6e48b. Process-group ownership now survives leader exit with identity/start-time and PGID reuse checks; shutdown is bounded by shared CODEX_COMPOSED_SHUTDOWN_MS, retains ownership on missing close or failed KILL, gates start on typed app-server readiness, settles delayed-start races, retries lock cleanup, matches strict-config across chunks, bounds executable proof, and exposes only bounded redacted diagnostics without public causes. Validation: focused codex-process suite 34 tests and 165 expectations passed; bun run type-check, bun run lint, bun run fmt:check, and git diff --check passed; bun run test:modules passed 1,047 tests and 7,211 expectations across 81 files; bun run test:repository passed 130 tests and 415 expectations across 11 files. Real process smoke passed with the project-local @openai/codex wrapper, exact [app-server,--stdio,--strict-config] argv, typed readiness, stopped state, no live leader, removed lock, and redacted snapshot; the real leader-exit plus TERM-resistant descendant owner also passed. Full system and serial-browser lanes were not run because this remediation is scoped to the leaf module. Preserved-work audit: status clean after the product commit, and BASE..HEAD contains only src/runtime/codex-process/** plus this tracking note; unrelated src-DlBR1tzg.js is untouched. Task remains In Progress with acceptance criteria unchecked. PARENT_ACTION: request independent review from reviewer 01a054fe-78c0-71f1-ae86-ad1afa22c77b; do not merge or finalize TASK-143.01.04.
<!-- SECTION:NOTES:END -->
