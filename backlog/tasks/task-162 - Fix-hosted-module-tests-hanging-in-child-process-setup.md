---
id: TASK-162
title: Fix hosted CLI compatibility test timeouts
status: In Progress
assignee:
  - '@codex'
created_date: '2026-09-08 00:40'
updated_date: '2026-09-08 01:04'
labels: []
dependencies: []
references:
  - 'https://github.com/miklschmidt/archboard/actions/runs/34173668405'
priority: high
type: bug
ordinal: 314000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
GitHub Actions run 34173668405 failed with code-target Git setup timeouts and command-contract runner failures despite a green local gate. A debug rerun passed all code-target cases but repeated the command-contract timeout and late cleanup error. The held-output compatibility test launches 22 real CLI processes under one five-second budget. Reliable CI must retain every output assertion while giving independent modes separate test ownership.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The failing hosted module cases complete successfully without weakening lint, type, test assertions or CI coverage.
- [x] #2 A repeatable focused reproduction demonstrates the cause and passes after the fix.
- [ ] #3 GitHub Actions succeeds for the pushed fix commit.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Reproduce the held-output timeout in a CPU-constrained Linux container, trace progress through the compatibility modes, and split independent modes into parameterized product tests if cumulative startup cost is confirmed. Preserve the existing assertions and default timeout. Run the same constrained reproduction and complete local gate, commit and push the focused fix, then monitor GitHub Actions and address any remaining failures.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
The compatibility owner launched 22 real CLI processes inside one five-second test. In the official Bun 1.4.0 Linux image with a one-CPU quota, it failed at 5003 ms; a diagnostic run showed every process completing normally in 6418 ms. A half-CPU quota reproduced the same timeout. Each of the eleven independent output modes now owns a named test with the original assertions and default timeout.

Validation: the complete local bun run check passed, including 2660 module tests and the full serial browser inventory. The runner and both code-target owners passed three repetitions at a half-CPU quota (132 passes, zero failures). The original code-target setup failures did not recur in the debug hosted attempt or these constrained runs. Temporary instrumentation, container, and detached worktree were removed; diagnostic output stays outside the repository.

Hosted verification of the fix is pending.
<!-- SECTION:NOTES:END -->
