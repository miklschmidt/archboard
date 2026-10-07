---
id: TASK-436.02
title: >-
  A run of the code check finishes, and its output starts with the time of each
  check
status: In Progress
assignee:
  - '@codex-language'
created_date: '2026-10-07 00:36'
updated_date: '2026-10-07 00:59'
labels:
  - code-check
dependencies: []
parent_task_id: TASK-436
ordinal: 696000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A run of the code check stops waiting for a language server after 30 s, says `language-server-failed` and keeps its candidates. On LLVM the index of clangd took 54 s, so the run never got its answers. The owner decided that the analysis must finish, because its result is important information. The owner also decided that the output of `archboard check` starts with the time that each check took.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 No time limit stops a run of the code check or a language server. A run stops early only when its caller cancels it or a server exits
- [ ] #2 The text output of `archboard check` and of `archboard check --code` starts with the time that each check took, for example the board check, the code facts, each language server and the history lens. The JSON answer gives the same times
- [ ] #3 INSTALL.md, the archboard skill and ADR 0046 describe no time limit
- [ ] #4 TASK-429 is archived, because a first run no longer stops after 30 s
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. No board is structurally affected: the existing modules and relationships remain. Remove code-check and history Git deadlines and language-server analysis deadlines; keep caller cancellation, process exits and bounded shutdown cleanup.
2. Record ordered elapsed times for the board request, code facts and judging, each started language server, and history lens. Put the same times in JSON and leading text lines.
3. Update installation/setup/ADR guidance, archive TASK-429 through Backlog CLI, adapt focused contract owners.
4. Run focused tests and type/lint checks, simplify the resulting interfaces and commit. Parent runs full integration gate.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented no-deadline analysis with caller cancellation/process-exit handling. Removed Git listing/history bounds and passed timeoutMs:null through code-check, plan and behind checkout snapshots; other engine Git callers retain their defaults. Language-server cleanup remains bounded after answers finish. Shared required timings contract records code-facts file reads/parses, each server active work (startup/index/queries/cleanup, excluding idle), and history; CLI prepends the board-request time and prints the same numbers first on stderr. Simplified duplicate measurements to one elapsed clock that counts overlap once. TASK-429 archived through CLI. Focused language-server owners passed 32 tests; code-check/history/CLI/route owners passed 125 tests; skill/install and final focused regression owners passed 277 and 27 tests. Root and frontend TypeScript checks passed before final clock extraction; final root check pending. Touched production/test lint passed. Full gate and board closing belong to parent integration.

Final root TypeScript check passed after the shared-clock simplification. The normal frontend TypeScript check also passed. No acceptance criteria or terminal status changed before parent integration.
<!-- SECTION:NOTES:END -->
