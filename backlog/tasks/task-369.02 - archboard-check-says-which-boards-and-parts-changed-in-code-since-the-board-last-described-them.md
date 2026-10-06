---
id: TASK-369.02
title: >-
  archboard check says which boards and parts changed in code since the board
  last described them
status: In Progress
assignee:
  - '@claude'
created_date: '2026-09-29 01:18'
updated_date: '2026-10-06 10:34'
labels:
  - history
  - cli
dependencies:
  - TASK-369.01
documentation:
  - docs/design/design-checks.md
parent_task_id: TASK-369
priority: high
type: feature
ordinal: 650000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The tracer bullet of the history lens, and its cheapest reading. TASK-257 found 141 commits with no vault update. On 2026-09-29, Board viewer was 10 commits behind, 6 of them in `subjects.ts`.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 For each board, the check reports the commits to its bound files since the point the ADR chose, per board and per part
- [ ] #2 Parts that drill into another board are skipped, and a binding to a directory counts every file below it
- [ ] #3 Renamed files keep their history, and repositories this machine has not registered stay silent
- [ ] #4 The reading does not run inside the check that open canvases poll every 5 seconds
- [ ] #5 archboard-dev and `.archboard/README.md` tell a maintainer to read it
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Shared schema src/shared/code-check: the answer of GET /api/vault/code-check { boards, findings, skipped, behind } (ADR 0046), findings = VaultDiagnostic with severity warning|information (empty from this task), skipped = board-level reasons (no-current-variant, board-unreadable), behind = per board: lastChange (commit | uncommitted | unknown), commits (repo, hash, time, subject, files, large), parts (subject, repo, path, commits) and skipped parts with reasons (unbound, drill-down, repository-unregistered, checkout-unavailable, ref-not-checked-out).
2. Runtime module src/runtime/history-lens (needs Git processes and the board store, so runtime; TASK-369.03-05 reuse it): a cancellable git runner with a timeout from timing.ts, the commit walk (no merges, -M renames, name-status, file counts, large = more than 30 files), the mapping of commits onto bound paths (file or every file below a directory, following renames newest first), the board's last change from the board file's own history (git log --follow, compareVariants on the current variant, uncommitted change = now, untracked-not-ignored = now, vault outside Git or ignored file = unknown), and behind per board and part (checkout has the commit: HEAD ^L; else commits after its time). Parts skipped: unbound, drill-down, unregistered repository, unavailable checkout, pinned to a ref the checkout does not have out. One walk per repository per request; an in-memory answer keyed on board versions, the checkouts with their HEADs and the vault HEAD.
3. Server: src/server/archboard/lib/code-check-route.ts mounts GET /api/vault/code-check as checkout work (checkoutWork.trackRequest: a disconnect or a stop cancels it), registered in application.ts; /api/vault/check is unchanged.
4. CLI: archboard check --code runs the plain check, then GET /api/vault/code-check; JSON result gains codeCheck; stderr prints findings, skips per reason and behind per board and part; exit 1 only for a plain diagnostic or a warning finding.
5. Tests: history-lens on a temp Git repository built in the test (criteria 1-3), the route (runs only on its own route, disconnect cancels: criterion 4), the CLI (exit status, plain check never asks the code route).
6. Docs: archboard-dev closing steps and .archboard/README.md tell a maintainer to read behind; cli-command-audit.json entry for check.
7. Dogfood: proposals Archboard server@TASK-369.02 (Code check route, History lens) and Command interface@TASK-369.02 (Vault check calls the code check route); run ./bin/dogfood check --code and compare with the design note's measurement.
<!-- SECTION:PLAN:END -->
